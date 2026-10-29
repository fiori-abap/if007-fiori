sap.ui.define(["zrap/if007/if007fiori/ext/util/ChangeStore"], function (ChangeStore) {
    "use strict";
    return {
        formatValue: function (order, item, original) {
            return ChangeStore.getValue(order, item, original, "ExternalStatus");
        },
        isEditable: function (order, item) { return ChangeStore.isRowEditable(order, item); },
        onLiveChange: function (event) {
            var control = event.getSource();
            ChangeStore.setValue(control.getBindingContext(), "ExternalStatus", event.getParameter("value"));
        }
    };
});
