// Dieses Client-Script deaktiviert den Submit-Button für 60 Sekunden,
// nachdem der Benutzer im Bestätigungsdialog auf "Yes" geklickt hat.
frappe.ui.form.on("Purchase Invoice Capture", {
	before_submit(frm) {
		frm.disable_save();
		setTimeout(() => frm.enable_save(), 60000);
	},
});
