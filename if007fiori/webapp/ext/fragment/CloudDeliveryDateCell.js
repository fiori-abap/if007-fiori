sap.ui.define(["zrap/if007/if007fiori/ext/util/ChangeStore"], function (ChangeStore) {
    "use strict";
    return {
        formatValue: function (order, item, original) {
            return ChangeStore.getValue(order, item, original, "CloudDeliveryDate");
        },
        isEditable: function (order, item) { return ChangeStore.isRowEditable(order, item); },
        onChange: function (event) {
            if (event.getParameter("valid") === false) { return; }
            var control = event.getSource();
            ChangeStore.setValue(control.getBindingContext(), "CloudDeliveryDate", control.getValue());
        }
    };
});
