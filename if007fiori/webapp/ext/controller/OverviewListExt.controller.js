sap.ui.define([
    "sap/ui/core/mvc/ControllerExtension",
    "zrap/if007/if007fiori/ext/util/ChangeStore"
], function (ControllerExtension, ChangeStore) {
    "use strict";

    return ControllerExtension.extend(
        "zrap.if007.if007fiori.ext.controller.OverviewListExt",
        {
            beforeRebindTable: function () {

                // 1. 获取当前选中的订单明细
                var oExtensionAPI =
                    this.base.getExtensionAPI();

                var aSelectedContexts =
                    oExtensionAPI.getSelectedContexts();

                // 2. 取消所有选中状态
                if (aSelectedContexts.length > 0) {

                    var oBinding =
                        aSelectedContexts[0].getBinding();

                    var oHeaderContext =
                        oBinding &&
                        oBinding.getHeaderContext();

                    if (oHeaderContext &&
                        typeof oHeaderContext.setSelected === "function") {

                        // 一次取消整个列表的选择
                        oHeaderContext.setSelected(false);

                    } else {

                        // 单独取消选中的记录
                        aSelectedContexts.forEach(function (oContext) {

                            if (typeof oContext.setSelected === "function") {
                                oContext.setSelected(false);
                            }
                        });
                    }
                }

                // 3. 清空未保存的修改
                ChangeStore.clear();

                console.log(
                    "[IF007] Rebind: changes and selection cleared"
                );
            }
        }
    );
});