/**************************************************************************
 * Purchase Invoice Capture – Inline-Vorschau
 *
 *  ✔ Bilder    -> <img>
 *  ✔ PDFs      -> natives <iframe src="…pdf#zoom=page-width">
 *  ✔ HTML      -> per fetch() laden & via <iframe srcdoc="…"> einbetten
 *  ✔ XML       -> POST an externe API -> fertiges HTML im <iframe>
 *  ✖ E-Mails   -> nicht unterstützt -> Hinweis im <iframe>
 *
 *               – Höhe = min(Fensterhöhe − HEADER_FOOTER_OFFSET − EXTRA_MARGIN,
 *                            MAX_IFRAME_HEIGHT)
 *                 So wird das Iframe nie bildschirmfüllend und bleibt immer
 *                 handlich ohne zusätzliches Scrollen.
 **************************************************************************/

const HEADER_FOOTER_OFFSET = 220;   // Platz für Form-Header, Toolbar …
const EXTRA_MARGIN         = 40;    // kleiner Sicherheitsrand
const MAX_IFRAME_HEIGHT    = 800;   // absolute Obergrenze fürs Iframe

let pdfObserver = null;             // ResizeObserver-Instanz
let pdfIframe   = null;             // aktives PDF-Iframe

/* 1 ─ Controller ***********************************************************/
frappe.ui.form.on("Purchase Invoice Capture", {
    /** Formular wurde (re)geladen */
    refresh(frm) {
        hook_into_attachments_refresh(frm);
        renderPreview(frm);
    },

    /** Datei angehängt */
    on_attachment_add(frm) {
        renderPreview(frm);
    },

    /** Datei gelöscht */
    on_attachment_remove(frm) {
        renderPreview(frm);
    }
});

/**
 * Sorgt dafür, dass nach jedem internen Neuzeichnen der
 * Attachments-Sidebar auch die Inline-Vorschau synchronisiert wird.
 */
function hook_into_attachments_refresh(frm) {
    if (frm._pic_hooked) return;            // nur einmal an-/einbinden
    frm._pic_hooked = true;

    const original_refresh = frm.attachments.refresh.bind(frm.attachments);

    frm.attachments.refresh = (...args) => {
        original_refresh(...args);          // Sidebar normal aufbauen

        /* Dropdown & Iframe sofort nachziehen (0-ms-Delay = nächster Tick),
           wenn alle Upload-Promisses erfüllt und die interne File-Liste
           vollständig ist.                                                 */
        setTimeout(() => renderPreview(frm), 0);
    };
}

/* 2 ─ Renderer *************************************************************/
async function renderPreview(frm) {
    const $wrap = frm.fields_dict.attachment_preview?.$wrapper;
    if (!$wrap) return;

    /* dieselbe Reihenfolge wie in der Sidebar ----------------------------- */
    const files = get_sorted_files(frm);
    $wrap.empty();
    if (!files.length) {
        $wrap.text(__("No attachment"));
        return;
    }

    /* Dropdown ------------------------------------------------------------- */
    const sel  = $('<select class="form-control mb-2">').appendTo($wrap);
    files.forEach(f =>
        $('<option>')
            .text(f.file_name)      // sichtbarer Name
            .val(f.file_url)        // tatsächliche URL
            .appendTo(sel)
    );
    const view = $('<div>').appendTo($wrap);

    sel.on("change", () => show(sel.val()));
    show(sel.val());

    /**************************** Inline-Anzeige *****************************/
    async function show(url) {
        clearObservers();
        view.removeAttr("style").empty();
        const lower = url.toLowerCase();

        /* ▸ Bilder ---------------------------------------------------------- */
        if (/\.(png|jpe?g|gif|bmp|webp)$/.test(lower)) {
            view.css({ "max-height":"500px", overflow:"auto" })
                .append(
                    $('<img style="max-width:100%">').attr("src", url)
                );
            return;
        }

        /* ▸ PDFs ------------------------------------------------------------ */
        if (lower.endsWith(".pdf")) {
            view.css({ overflow:"hidden" });

            pdfIframe = $('<iframe style="width:100%;border:0;display:block;">')
                .appendTo(view)[0];

            const loadPdf = (reload = true) => {
                const h = Math.min(
                    window.innerHeight - HEADER_FOOTER_OFFSET - EXTRA_MARGIN,
                    MAX_IFRAME_HEIGHT
                );
                view.css("height", h);
                pdfIframe.style.height = h + "px";
                if (reload) {
                    pdfIframe.src = `${url}#zoom=page-width&t=${Date.now()}`;
                }
            };
            loadPdf();

            /* Neu laden, wenn sich die Breite ändert (Zoom wieder „page-width“) */
            let lastWidth = view[0].clientWidth;
            pdfObserver = new ResizeObserver(entries => {
                const width = entries[0].contentRect.width;
                if (width !== lastWidth) {
                    lastWidth = width;
                    loadPdf();          // komplett neu laden
                } else {
                    loadPdf(false);     // nur Höhe nachführen
                }
            });
            pdfObserver.observe(view[0]);

            /* Fenster-Resize: nur Höhe angleichen */
            $(window)
                .off("resize.pic_pdf")
                .on("resize.pic_pdf", () => loadPdf(false));
            return;
        }

        /* ▸ HTML ------------------------------------------------------------ */
        if (/\.(html?|htm)$/.test(lower)) {
            view.css({ overflow:"hidden" }).text(__("Loading HTML …"));
            try {
                const htmlText = await fetch(url).then(r => r.text());

                view.empty();
                const ifr = $('<iframe style="width:100%;border:0;display:block;">')
                    .appendTo(view)[0];

                const adjustHeight = () => {
                    const h = Math.min(
                        window.innerHeight - HEADER_FOOTER_OFFSET - EXTRA_MARGIN,
                        MAX_IFRAME_HEIGHT
                    );
                    view.css("height", h);
                    ifr.style.height = h + "px";
                };
                adjustHeight();

                ifr.srcdoc = htmlText;
                $(window)
                    .off("resize.pic_html")
                    .on("resize.pic_html", adjustHeight);
            } catch (e) {
                view.html(
                    `<p class="text-danger">${__("HTML preview failed")}:<br>${e}</p>`
                );
            }
            return;
        }

        /* ▸ XML ------------------------------------------------------------- */
        if (lower.endsWith(".xml")) {
            view.css({ "max-height":"500px", overflow:"auto" }).text(__("Loading XML …"));
            try {
                const xml  = await fetch(url).then(r => r.text());
                const html = await fetch(
                    "https://api.badsanieren24.de/xml_to_html",
                    {
                        method:"POST",
                        headers:{ "Content-Type":"application/xml" },
                        body:xml
                    }
                ).then(r => r.text());

                const ifr = $('<iframe style="width:100%;border:0;">')
                    .appendTo(view)[0];
                ifr.srcdoc = `<html><body style="margin:0">${html}</body></html>`;
                ifr.onload = () =>
                    ifr.style.height = Math.min(
                        ifr.contentDocument.body.scrollHeight,
                        MAX_IFRAME_HEIGHT
                    ) + "px";
            } catch (e) {
                view.html(
                    `<p class="text-danger">${__("XML preview failed")}:<br>${e}</p>`
                );
            }
            return;
        }

        /* ▸ E-Mails (.eml) --------------------------------------------------- */
        if (lower.endsWith(".eml")) {
            view.css({ overflow:"hidden" });

            const ifr = $('<iframe style="width:100%;border:0;display:block;">')
                .appendTo(view)[0];

            const adjustHeight = () => {
                const h = Math.min(
                    window.innerHeight - HEADER_FOOTER_OFFSET - EXTRA_MARGIN,
                    MAX_IFRAME_HEIGHT
                );
                view.css("height", h);
                ifr.style.height = h + "px";
            };
            adjustHeight();
            $(window)
                .off("resize.pic_html")
                .on("resize.pic_html", adjustHeight);

            // Hinweis ausgeben
            const msg = __("This file type cannot be displayed.");
            ifr.srcdoc =
                `<html><body style="margin:0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100%;"><p>${msg}</p></body></html>`;
            return;
        }

        /* ▸ Unbekannter Typ -------------------------------------------------- */
        view.css({ "max-height":"500px", overflow:"auto" })
            .html(`<i>${__("File type not supported")}</i>`);
    }

    /* Aufräumen **************************************************************/
    function clearObservers() {
        if (pdfObserver) {
            pdfObserver.disconnect();
            pdfObserver = null;
        }
        $(window).off("resize.pic_pdf resize.pic_html");
        pdfIframe = null;
    }
}

/**
 * Liefert die File-Liste in exakt derselben Reihenfolge,
 * die Frappe auch für die Attachments-Sidebar verwendet.
 */
function get_sorted_files(frm) {
    /* Seit Frappe v15 existiert frm.attachments.get_files(),
       das bereits richtig sortiert.                           */
    if (frm.attachments && typeof frm.attachments.get_files === "function") {
        return frm.attachments.get_files();
    }

    /* Fallback: frm.get_files() → selbst nach Erstellung-Datum sortieren   */
    if (typeof frm.get_files === "function") {
        return (frm.get_files() || []).slice().sort((a, b) =>
            // neueste (höchster Zeitstempel) zuerst
            new Date(b.creation || b.modified || 0) - new Date(a.creation || a.modified || 0)
        );
    }

    return [];
}
