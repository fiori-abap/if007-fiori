sap.ui.define([
    "zrap/if007/if007fiori/ext/util/ChangeStore"
], function (ChangeStore) {
    "use strict";

    return {

        // 显示时优先使用未保存的修改值
        formatValue: function (sOrder, sItem, sOriginal) {
            return ChangeStore.getValue(
                sOrder,
                sItem,
                sOriginal,
                "CommentText"
            );
        },

        // 输入文字时实时记录
        onLiveChange: function (oEvent) {

            var oInput = oEvent.getSource();
            var oContext = oInput.getBindingContext();
            var sValue = oEvent.getParameter("value");

            ChangeStore.setValue(
                oContext,
                "CommentText",
                sValue
            );
        }
    };
});