sap.ui.define([
    "zrap/if007/if007fiori/ext/util/ChangeStore"
], function (ChangeStore) {
    "use strict";
    return {
        formatValue: function (sOrder, sItem, sOriginal) {
            return ChangeStore.getValue(sOrder, sItem, sOriginal, "CommentText");
        },
        isEditable: function (sOrder, sItem) {
            return ChangeStore.isRowEditable(sOrder, sItem);
        },
        onLiveChange: function (oEvent) {
            var oInput = oEvent.getSource();
            ChangeStore.setValue(
                oInput.getBindingContext(), "CommentText", oEvent.getParameter("value")
            );
        }
    };
});
