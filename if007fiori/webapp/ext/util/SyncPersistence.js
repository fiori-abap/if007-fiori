sap.ui.define([
    "zrap/if007/if007fiori/ext/util/ChangeStore"
], function (ChangeStore) {
    "use strict";

    var ROOT = "/sap/opu/odata4/sap/zui_if007_sync_o4/srvd/sap/zui_if007_sync/0001/";
    var FIELDS = ["RequestId", "SapSaveState", "CloudSaveState", "PendingComment",
        "PendingFollowUpDate", "PendingSapStatus", "PendingDeliveryDate",
        "PendingExternalStatus", "ChangeMask", "SapError", "CloudError"];

    function norm(v, n) {
        var s = String(v == null ? "" : v).trim();
        return /^\d+$/.test(s) && s.length <= n ? s.padStart(n, "0") : s;
    }
    function itemForUrl(item) {
        var value = norm(item, 6);
        return /^\d+$/.test(value) ? String(Number(value)) : value;
    }
    function getModel() {
        var model = ChangeStore.getSyncModel();
        if (!model) { throw new Error("Sync Model 未初始化"); }
        return model;
    }
    function escapeOData(s) { return String(s).replace(/'/g, "''"); }
    function keyUrl(order, item) {
        return ROOT + "Sync(SalesOrder='" + encodeURIComponent(escapeOData(norm(order, 10))) +
            "',SalesOrderItem='" + encodeURIComponent(escapeOData(itemForUrl(item))) + "')";
    }
    function dateValue(value) { return value ? String(value).slice(0, 10) : null; }
    function payload(row) {
        return {
            RequestId: String(row.RequestId || ""),
            SapSaveState: row.SapSaveState || "P",
            CloudSaveState: row.CloudSaveState || "P",
            PendingComment: row.PendingComment == null ? "" : String(row.PendingComment),
            PendingFollowUpDate: dateValue(row.PendingFollowUpDate),
            PendingSapStatus: row.PendingSapStatus || "",
            PendingDeliveryDate: dateValue(row.PendingDeliveryDate),
            PendingExternalStatus: row.PendingExternalStatus || "",
            ChangeMask: row.ChangeMask || "00000",
            SapError: row.SapError || "",
            CloudError: row.CloudError || ""
        };
    }
    function validate(row) {
        if (!norm(row.SalesOrder, 10) || !norm(row.SalesOrderItem, 6) ||
            !row.RequestId || String(row.RequestId).length > 32 ||
            !/^[01]{5}$/.test(row.ChangeMask || "")) {
            throw new Error("同步快照 Key、RequestId 或 ChangeMask 不正确");
        }
        if (String(row.PendingComment || "").length > 255 ||
            String(row.PendingExternalStatus || "").length > 20) {
            throw new Error("同步快照字段超出长度");
        }
    }
    async function readSnapshot(order, item) {
        var b = getModel().bindList("/Sync", undefined, undefined, undefined, {
            $filter: "SalesOrder eq '" + escapeOData(norm(order, 10)) + "'",
            $$groupId: "$direct"
        });
        try {
            for (var offset = 0; offset < 10000; offset += 100) {
                var contexts = await b.requestContexts(offset, 100);
                for (var c of contexts) {
                    if (norm(c.getProperty("SalesOrder"), 10) === norm(order, 10) &&
                        norm(c.getProperty("SalesOrderItem"), 6) === norm(item, 6)) {
                        return await c.requestObject();
                    }
                }
                if (contexts.length < 100) { return null; }
            }
            throw new Error("同步记录查询超过安全分页上限");
        } finally { b.destroy(); }
    }
    async function token() {
        for (var method of ["GET", "HEAD"]) {
            var response = await fetch(ROOT, {
                method: method, credentials: "same-origin", cache: "no-store",
                headers: {"X-CSRF-Token": "Fetch", "Accept": "application/json"}
            });
            var value = response.headers.get("X-CSRF-Token");
            if (response.ok && value && value.toLowerCase() !== "required") { return value; }
        }
        throw new Error("Sync OData CSRF Token 获取失败");
    }
    async function patchOnce(order, item, body, etag, csrf) {
        return fetch(keyUrl(order, item), {
            method: "PATCH", credentials: "same-origin",
            headers: {
                "Content-Type": "application/json", "Accept": "application/json",
                "X-CSRF-Token": csrf, "If-Match": etag
            },
            body: JSON.stringify(body)
        });
    }
    function equal(a, b) {
        return (a == null && b == null) || a === b;
    }
    async function updateSnapshot(row, expectedId) {
        validate(row);
        var current = await readSnapshot(row.SalesOrder, row.SalesOrderItem);
        if (!current) { throw new Error("同步记录不存在，无法 UPDATE"); }
        if (expectedId && current.RequestId !== expectedId) {
            throw new Error("同步记录已被其他请求更新，禁止覆盖旧任务");
        }
        var etag = current["@odata.etag"];
        if (!etag) { throw new Error("同步记录缺少 ETag"); }
        var body = payload(row);
        var csrf = await token();
        var result = await patchOnce(row.SalesOrder, row.SalesOrderItem, body, etag, csrf);
        if (result.status === 403) {
            // A stale CSRF token can be refreshed; do not retry arbitrary HTTP errors.
            csrf = await token();
            result = await patchOnce(row.SalesOrder, row.SalesOrderItem, body, etag, csrf);
        }
        if (!result.ok) {
            var responseText = await result.text();
            throw new Error("Sync PATCH HTTP " + result.status + ": " + responseText.slice(0, 350));
        }
        var saved = await readSnapshot(row.SalesOrder, row.SalesOrderItem);
        if (!saved || !FIELDS.every(function (field) {
            return equal(saved[field], body[field]);
        })) {
            throw new Error("Sync PATCH 已执行，但回读结果不一致；需核对实际状态");
        }
        return saved;
    }
    async function createSnapshot(row) {
        validate(row);
        var body = Object.assign({
            SalesOrder: norm(row.SalesOrder, 10),
            SalesOrderItem: itemForUrl(row.SalesOrderItem)
        }, payload(row));
        var model = getModel();
        var b = model.bindList("/Sync", undefined, undefined, undefined, {
            $$groupId: "$direct", $$updateGroupId: "$direct"
        });
        try {
            var completed = new Promise(function (resolve, reject) {
                b.attachCreateCompleted(function (event) {
                    if (event.getParameter("success")) { resolve(); }
                    else { reject(new Error("Sync CREATE HTTP 失败")); }
                });
            });
            var context = b.create(body, true);
            await completed;
            await context.created();
            var saved = await readSnapshot(row.SalesOrder, row.SalesOrderItem);
            if (!saved || saved.RequestId !== body.RequestId) {
                throw new Error("Sync CREATE 已返回成功，但回读结果不符");
            }
            return saved;
        } finally { b.destroy(); }
    }
    async function saveSnapshot(row, expectedId) {
        var current = await readSnapshot(row.SalesOrder, row.SalesOrderItem);
        return current ? updateSnapshot(row, expectedId || current.RequestId) : createSnapshot(row);
    }
    async function updateSideResult(row, side, state, error) {
        var existing = await readSnapshot(row.SalesOrder, row.SalesOrderItem);
        if (!existing || existing.RequestId !== row.RequestId) {
            throw new Error("同步任务 ID 已改变，停止回写旧结果");
        }
        var next = Object.assign({
            SalesOrder: row.SalesOrder, SalesOrderItem: row.SalesOrderItem
        }, existing);
        if (side === "sap") {
            next.SapSaveState = state;
            next.SapError = error || "";
        } else if (side === "cloud") {
            next.CloudSaveState = state;
            next.CloudError = error || "";
        } else { throw new Error("非法保存端: " + side); }
        return updateSnapshot(next, row.RequestId);
    }
    return {
        readSnapshot: readSnapshot,
        createSnapshot: createSnapshot,
        updateSnapshot: updateSnapshot,
        saveSnapshot: saveSnapshot,
        updateSideResult: updateSideResult
    };
});
