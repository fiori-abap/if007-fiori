sap.ui.define([
    "zrap/if007/if007fiori/ext/util/ChangeStore"
], function (ChangeStore) {
    "use strict";
    return {
        formatValue: function (sOrder, sItem, sOriginal) {
            return ChangeStore.getValue(sOrder, sItem, sOriginal, "FollowUpDate");
        },
        isEditable: function (sOrder, sItem) {
            return ChangeStore.isRowEditable(sOrder, sItem);
        },
        onChange: function (oEvent) {
            if (oEvent.getParameter("valid") === false) {
                return;
            }
            var oDatePicker = oEvent.getSource();
            ChangeStore.setValue(
                oDatePicker.getBindingContext(), "FollowUpDate", oDatePicker.getValue()
            );
        }
    };
});
