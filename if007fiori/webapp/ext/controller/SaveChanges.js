sap.ui.define([
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/BusyDialog",
    "zrap/if007/if007fiori/ext/util/ChangeStore",
    "zrap/if007/if007fiori/ext/util/SyncPersistence"
], function (MessageToast, MessageBox, BusyDialog, ChangeStore, SyncPersistence) {
    "use strict";

    var bSaving = false;
    var sActionPath = "/Addon/com.sap.gateway.srvd.zui_if007_addon.v0001.saveBatch(...)";
    var FIELDS = ["CommentText", "FollowUpDate", "SapStatus", "CloudDeliveryDate", "ExternalStatus"];
    var PENDING = ["PendingComment", "PendingFollowUpDate", "PendingSapStatus",
        "PendingDeliveryDate", "PendingExternalStatus"];
    var busy = new BusyDialog({
        title: "正在保存", text: "逐条保存 SAP / Cloud，并回写同步状态…", showCancelButton: false
    });

    function key(order, item) {
        return JSON.stringify([norm(order, 10), norm(item, 6)]);
    }
    function norm(value, size) {
        var s = String(value == null ? "" : value).trim();
        return /^\d+$/.test(s) && s.length <= size ? s.padStart(size, "0") : s;
    }
    function requestId() {
        if (typeof crypto !== "undefined" && crypto.randomUUID) {
            return crypto.randomUUID().replace(/-/g, "");
        }
        return (Date.now().toString(16) + Math.random().toString(16).slice(2) +
            Math.random().toString(16).slice(2)).padEnd(32, "0").slice(0, 32);
    }
    function defaultValue(field, value) {
        if (field === "FollowUpDate" || field === "CloudDeliveryDate") { return value || ""; }
        return value == null ? "" : value;
    }
    function maskFromChanges(changes) {
        return FIELDS.map(function (f) {
            return Object.prototype.hasOwnProperty.call(changes, f) ? "1" : "0";
        }).join("");
    }
    function collectRows(selected, mode) {
        var byKey = Object.create(null);
        ChangeStore.getChanges().forEach(function (row) { byKey[key(row.SalesOrder, row.SalesOrderItem)] = row; });
        var rows = [];
        selected.forEach(function (context) {
            var order = context.getProperty("SalesOrder"), item = context.getProperty("SalesOrderItem");
            var pending = ChangeStore.getPendingRow(order, item);
            if (pending) {
                rows.push(Object.assign({}, pending));
                return;
            }
            var changes = byKey[key(order, item)];
            if (mode === "A" && !changes) { return; }
            var row = {
                SalesOrder: norm(order, 10), SalesOrderItem: norm(item, 6),
                RequestId: requestId(), ChangeMask: maskFromChanges(changes || {})
            };
            FIELDS.forEach(function (field) {
                row[field] = defaultValue(field,
                    changes && Object.prototype.hasOwnProperty.call(changes, field)
                        ? changes[field] : context.getProperty(field));
            });
            rows.push(row);
        });
        return rows;
    }
    function validateRow(row) {
        if (!row.SalesOrder || !row.SalesOrderItem || !/^[01]{5}$/.test(row.ChangeMask)) {
            throw new Error("受注番号 / 明細番号 / 修改标记有误");
        }
        if (String(row.CommentText).length > 255) { throw new Error("备注超过255字符"); }
        for (var date of [row.FollowUpDate, row.CloudDeliveryDate]) {
            if (date && !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
                throw new Error("日期必须是 yyyy-MM-dd");
            }
        }
        if (row.SapStatus && !["OPEN", "PROC", "DONE"].includes(row.SapStatus)) {
            throw new Error("SAP业务状态只能是 OPEN/PROC/DONE");
        }
        if (String(row.ExternalStatus).length > 20) { throw new Error("外部状态超过20字符"); }
        // Current iFlow JDBC settings cannot reliably clear an existing DATE column with empty XML.
        if (row.ChangeMask[3] === "1" && !row.CloudDeliveryDate) {
            throw new Error("暂不支持清空 Cloud 纳入予定日；请填写日期再保存");
        }
    }
    function snapshot(row, sapState, cloudState) {
        var result = {
            SalesOrder: norm(row.SalesOrder, 10), SalesOrderItem: norm(row.SalesOrderItem, 6),
            RequestId: row.RequestId, ChangeMask: row.ChangeMask,
            SapSaveState: sapState, CloudSaveState: cloudState,
            SapError: "", CloudError: ""
        };
        FIELDS.forEach(function (field, i) {
            result[PENDING[i]] = (field === "FollowUpDate" || field === "CloudDeliveryDate")
                ? (row[field] || null) : (row[field] || "");
        });
        return result;
    }
    function requestJson(row) {
        return JSON.stringify({rows: [{
            orderNo: norm(row.SalesOrder, 10),
            itemNo: norm(row.SalesOrderItem, 6),
            followUpDate: row.FollowUpDate || "",
            commentText: row.CommentText || "",
            sapStatus: row.SapStatus || "",
            cloudDeliveryDate: row.CloudDeliveryDate || "",
            externalStatus: row.ExternalStatus || "",
            changeMask: row.ChangeMask
        }]});
    }
    async function callAction(side, row) {
        var model = ChangeStore.getAddonModel();
        if (!model) { throw new Error("Addon OData Model 未初始化"); }
        var action = model.bindContext(sActionPath);
        action.setParameter("SaveMode", side === "sap" ? "S" : "C");
        action.setParameter("RowsJson", requestJson(row));
        try {
            await action.invoke("$direct");
            var context = action.getBoundContext();
            var res = context && context.getObject();
            if (res && Array.isArray(res.value)) { res = res.value[0]; }
            if (!res) { throw new Error("saveBatch 返回空"); }
            return res;
        } finally {
            if (typeof action.destroy === "function") { action.destroy(); }
        }
    }
    async function executeSide(side, row) {
        // No relevant field changed: mark this side as successfully skipped.
        if (side === "sap" && ![0, 1, 2].some(function (i) { return row.ChangeMask[i] === "1"; })) {
            return {state: "S", message: "SAP字段未变更"};
        }
        if (side === "cloud" && ![0, 3, 4].some(function (i) { return row.ChangeMask[i] === "1"; })) {
            return {state: "S", message: "Cloud字段未变更"};
        }
        try {
            var res = await callAction(side, row);
            var code = side === "sap" ? res.SapStatus : res.CloudStatus;
            var message = side === "sap" ? res.SapMessage : res.CloudMessage;
            if (code === "S") { return {state: "S", message: ""}; }
            if (code === "F") { return {state: "E", message: message || "明确返回失败"}; }
            // P (partial) or N cannot identify a committed per-row result.
            return {state: "U", message: message || "结果未确认，请核对实际数据"};
        } catch (err) {
            return {state: "U", message: "请求异常，可能已提交：" + (err.message || err)};
        }
    }
    async function prepare(row, mode) {
        var current = await SyncPersistence.readSnapshot(row.SalesOrder, row.SalesOrderItem);
        if ((mode === "S" || mode === "C") && !current) {
            throw new Error("失败快照不存在，禁止在缺少原始输入时重试");
        }
        if ((mode === "S" || mode === "C") && current.RequestId !== row.RequestId) {
            throw new Error("请求 ID 已改变，禁止使用旧数据重试");
        }
        var sapState = current && mode === "C" ? current.SapSaveState : "P";
        var cloudState = current && mode === "S" ? current.CloudSaveState : "P";
        var data = snapshot(row, sapState, cloudState);
        if (mode === "S" && current) { data.CloudError = current.CloudError || ""; }
        if (mode === "C" && current) { data.SapError = current.SapError || ""; }
        await SyncPersistence.saveSnapshot(data, current && current.RequestId);
        ChangeStore.beginRow(Object.assign({}, row, data));
    }
    async function save(mode, selected) {
        if (bSaving) { return; }
        if (!Array.isArray(selected) || !selected.length) { MessageToast.show("请先勾选订单"); return; }
        if (ChangeStore.getModeForSelection(selected) !== mode) {
            MessageBox.warning("所选订单状态不同，或仍在读取/核对，请分别处理");
            return;
        }
        var rows = collectRows(selected, mode);
        if (!rows.length) { MessageToast.show("所选订单没有修改"); return; }
        try { rows.forEach(validateRow); }
        catch (error) { MessageBox.error(error.message); return; }

        bSaving = true;
        ChangeStore.setBusy(true);
        busy.open();
        var messages = [], done = 0, errors = 0;
        try {
            // One order per SAP/Cloud call: the current JDBC response has no trustworthy per-order details.
            for (var row of rows) {
                var title = row.SalesOrder + "/" + row.SalesOrderItem;
                try {
                    await prepare(row, mode); // MUST commit snapshot before sending either side
                    var sides = mode === "A" ? ["sap", "cloud"] : [mode === "S" ? "sap" : "cloud"];
                    for (var side of sides) {
                        var outcome = await executeSide(side, row);
                        // Persist result BEFORE running the next side.
                        await SyncPersistence.updateSideResult(row, side, outcome.state,
                            outcome.message.slice(0, 255));
                        ChangeStore.setSideResult(row, side, outcome.state, outcome.message);
                    }
                    if (ChangeStore.finishRow(row)) { done++; }
                    else {
                        errors++;
                        messages.push(title + "：SAP/Cloud 保存结果未全部成功（可按对应失败侧重试）");
                    }
                } catch (error) {
                    errors++;
                    messages.push(title + "：" + (error.message || error) +
                        "。可能已写入一侧，请先核对同步记录，勿盲目重试。");
                    console.error("[IF007] Save row error", row, error);
                }
            }
            if (!errors) { MessageToast.show("SAP 和 Cloud 保存成功：" + done + " 条"); }
            else { MessageBox.warning("成功 " + done + " 条，待处理 " + errors + " 条。\n\n" +
                messages.join("\n"), {title: "IF007 保存结果"}); }
        } finally {
            busy.close();
            ChangeStore.setBusy(false);
            bSaving = false;
        }
    }
    return {
        isEnabled: function (_context, selected) {
            return !bSaving && ChangeStore.getModeForSelection(selected) === "A";
        },
        isSapRetryEnabled: function (_context, selected) {
            return !bSaving && ChangeStore.getModeForSelection(selected) === "S";
        },
        isCloudRetryEnabled: function (_context, selected) {
            return !bSaving && ChangeStore.getModeForSelection(selected) === "C";
        },
        onSaveChanges: function (_context, selected) { return save("A", selected); },
        onSaveSap: function (_context, selected) { return save("S", selected); },
        onSaveCloud: function (_context, selected) { return save("C", selected); }
    };
});
