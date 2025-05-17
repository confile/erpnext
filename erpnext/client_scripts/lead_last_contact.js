frappe.ui.form.on('Lead', {
    refresh: frm => show_last_contact(frm),
    timeline_refresh: frm => show_last_contact(frm)
});

async function show_last_contact(frm) {
    if (frm.is_new()) return;

    const communicationPromise = frappe.db.get_list('Communication', {
        filters: {
            reference_doctype: 'Lead',
            reference_name: frm.doc.name
        },
        fields: ['creation', 'sender', 'sent_or_received'],
        order_by: 'creation desc',
        limit: 1
    });

    const commentPromise = frappe.db.get_list('Comment', {
        filters: {
            reference_doctype: 'Lead',
            reference_name: frm.doc.name
        },
        fields: ['creation', 'comment_email', 'owner'],
        order_by: 'creation desc',
        limit: 1
    });

    const [communications, comments] = await Promise.all([
        communicationPromise,
        commentPromise
    ]);

    let lastContact = null;

    if (communications && communications.length) {
        lastContact = communications[0];
    }
    if (comments && comments.length) {
        if (!lastContact || comments[0].creation > lastContact.creation) {
            lastContact = comments[0];
        }
    }

    if (lastContact) {
        const datum = frappe.datetime.str_to_user(lastContact.creation);
        frm.dashboard.set_headline_alert(
            `Letzter Kontakt am ${datum}`,
            'blue'
        );
    }
}
