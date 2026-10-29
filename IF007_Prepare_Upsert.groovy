import com.sap.gateway.ip.core.customdev.util.Message
import groovy.json.JsonSlurper
import groovy.xml.MarkupBuilder
import java.time.LocalDate

Message processData(Message message) {
    def data = new JsonSlurper().parseText(message.getBody(String))
    if (!(data instanceof Map) || !(data.rows instanceof List) || data.rows.isEmpty()) {
        throw new IllegalArgumentException('送信対象データがありません')
    }
    def orders = []
    def keys = new HashSet()
    data.rows.eachWithIndex { row, index ->
        if (!(row instanceof Map)) {
            throw new IllegalArgumentException("${index + 1}件目：データ形式が不正です")
        }
        String orderNo = row.orderNo?.toString()?.trim() ?: ''
        String itemNo = row.itemNo?.toString()?.trim() ?: ''
        String changeMask = row.changeMask?.toString() ?: ''
        boolean legacy = !(changeMask ==~ /[01]{5}/)
        String date = (legacy ? row.followUpDate : row.cloudDeliveryDate)?.toString()?.trim() ?: ''
        String comment = row.commentText?.toString() ?: ''
        String status = (legacy ? row.sapStatus : row.externalStatus)?.toString()?.trim() ?: ''
        boolean writeComment = legacy || changeMask.charAt(0) == '1'
        boolean writeDate = legacy || changeMask.charAt(3) == '1'
        boolean writeStatus = legacy || changeMask.charAt(4) == '1'

        if (!orderNo || !itemNo) {
            throw new IllegalArgumentException("${index + 1}件目：受注番号または明細番号が未入力です")
        }
        if (!keys.add(orderNo + '|' + itemNo)) {
            throw new IllegalArgumentException("${index + 1}件目：キーが重複しています")
        }
        if (writeDate && date) {
            try { LocalDate.parse(date) }
            catch (Exception e) { throw new IllegalArgumentException("${index + 1}件目：Cloud日付が不正です") }
        }
        if (!legacy && writeDate && !date) {
            throw new IllegalArgumentException("${index + 1}件目：Cloud日付の空欄更新は未対応です")
        }
        if (comment.length() > 255 || status.length() > 20) {
            throw new IllegalArgumentException("${index + 1}件目：文字数制限を超えています")
        }
        if (!(writeComment || (writeDate && date) || writeStatus)) {
            throw new IllegalArgumentException("${index + 1}件目：Cloudの変更対象がありません")
        }
        orders.add([orderNo:orderNo, itemNo:itemNo, date:date, comment:comment,
                    status:status, writeComment:writeComment, writeDate:writeDate,
                    writeStatus:writeStatus])
    }
    def writer = new StringWriter()
    def xml = new MarkupBuilder(writer)
    xml.root {
        orders.eachWithIndex { order, index ->
            xml."Statement${index + 1}" {
                dbTableName(action: 'UPDATE_INSERT') {
                    table('IF007_EXT.ORDER_STATUS')
                    access {
                        ORDER_NO(hasQuot: 'Yes', order.orderNo)
                        ITEM_NO(hasQuot: 'Yes', order.itemNo)
                        if (order.writeDate && order.date) {
                            DELIVERY_DATE(hasQuot: 'Yes', order.date)
                        }
                        if (order.writeStatus) {
                            EXTERNAL_STATUS(hasQuot: 'Yes', order.status)
                        }
                        if (order.writeComment) {
                            COMMENT(hasQuot: 'Yes', order.comment)
                        }
                    }
                    key1 {
                        ORDER_NO(hasQuot: 'Yes', order.orderNo)
                        ITEM_NO(hasQuot: 'Yes', order.itemNo)
                    }
                }
            }
        }
    }
    message.setProperty('WriteMode', 'U')
    message.setProperty('RequestedCount', orders.size())
    message.setBody(writer.toString())
    return message
}
