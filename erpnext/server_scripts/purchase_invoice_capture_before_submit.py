# ruff: noqa: F821

# Routing key for external validation
ROUTING_KEY = "Purchase-Invoice-Capture-Validation"

# Prepare payload with required details
payload = {
	"docname": doc.name,
	"submit_after_validate": True,
	"datetime": frappe.utils.now(),
	"user": frappe.session.user,
}

try:
	frappe.call(
		"bs24core.api.call_async_n8n_function",
		routingKey=ROUTING_KEY,
		jsonparam=frappe.as_json(payload),
	)
except Exception as e:
	frappe.log_error(
		f"Error sending Purchase Invoice Capture validation for {doc.name}: {e}",
		"Purchase Invoice Capture Pre Submit",
	)

frappe.msgprint(
	"Dokument würd zur Prüfung gesendet und anschließend weiter verarbeitet.",
	alert=True,
	indicator="blue",
)

raise frappe.ValidationError
