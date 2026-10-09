sap.ui.define([
    "sap/ui/core/mvc/ControllerExtension",
    "zrap/if007/if007fiori/ext/util/ChangeStore"
], function (ControllerExtension, ChangeStore) {
    "use strict";

    return ControllerExtension.extend(
        "zrap.if007.if007fiori.ext.controller.OverviewListExt",
        {
            override: {

                onAfterRendering: function () {

                    var oView = this.base.getView();

                    // 查找 Fiori Elements 的查询栏
                    var aFilterBars = oView.findAggregatedObjects(
                        true,
                        function (oControl) {
                            return oControl.isA(
                                "sap.ui.mdc.FilterBar"
                            );
                        }
                    );

                    if (aFilterBars.length === 0) {
                        console.warn(
                            "[IF007] FilterBar not found"
                        );
                        return;
                    }

                    var oFilterBar = aFilterBars[0];

                    // 避免重复注册
                    if (this._oFilterBar === oFilterBar) {
                        return;
                    }

                    if (this._oFilterBar) {
                        this._oFilterBar.detachSearch(
                            this._onSearch,
                            this
                        );
                    }

                    this._oFilterBar = oFilterBar;

                    oFilterBar.attachSearch(
                        this._onSearch,
                        this
                    );

                    console.log(
                        "[IF007] Go event registered"
                    );
                },

                onExit: function () {
                    if (this._oFilterBar) {
                        this._oFilterBar.detachSearch(
                            this._onSearch,
                            this
                        );
                    }
                }
            },

            _onSearch: function () {

                // 1. 清空所有未保存修改
                ChangeStore.clear();

                // 2. 恢复当前画面控件的后台原值
                var oView = this.base.getView();

                var aControls = oView.findAggregatedObjects(
                    true,
                    function (oControl) {

                        var sId = oControl.getId();

                        return (
                            sId.includes("idCommentTextInput") ||
                            sId.includes("idFollowUpDatePicker") ||
                            sId.includes("idSapStatusComboBox")
                        );
                    }
                );

                aControls.forEach(function (oControl) {

                    var oContext =
                        oControl.getBindingContext();

                    if (!oContext) {
                        return;
                    }

                    var sId = oControl.getId();

                    if (sId.includes("idCommentTextInput")) {

                        oControl.setValue(
                            oContext.getProperty("CommentText") || ""
                        );

                    } else if (
                        sId.includes("idFollowUpDatePicker")
                    ) {

                        oControl.setValue(
                            oContext.getProperty("FollowUpDate") || ""
                        );

                    } else if (
                        sId.includes("idSapStatusComboBox")
                    ) {

                        var sStatus =
                            oContext.getProperty("SapStatus") || "";

                        oControl.setSelectedKey(sStatus);

                        if (!sStatus) {
                            oControl.setValue("");
                        }
                    }
                });

                console.log(
                    "[IF007] Go: unsaved changes cleared"
                );
            }
        }
    );
});