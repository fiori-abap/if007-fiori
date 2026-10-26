import com.sap.gateway.ip.core.customdev.util.Message
import groovy.json.JsonSlurper
import groovy.xml.MarkupBuilder
import java.time.LocalDate

Message processData(Message message) {

    // 1. 接收批量 JSON
    def data = new JsonSlurper().parseText(
        message.getBody(String)
    )

    if (!(data instanceof Map) ||
        !(data.rows instanceof List) ||
        data.rows.isEmpty()) {

        throw new IllegalArgumentException(
            "送信対象データがありません"
        )
    }

    // 2. 检查数据
    def orders = []
    def keys = new HashSet()

    data.rows.eachWithIndex { row, index ->

        if (!(row instanceof Map)) {
            throw new IllegalArgumentException(
                "${index + 1}件目：データ形式が不正です"
            )
        }

        String orderNo =
            row.orderNo?.toString()?.trim() ?: ""

        String itemNo =
            row.itemNo?.toString()?.trim() ?: ""

        String date =
            row.followUpDate?.toString()?.trim() ?: ""

        String comment =
            row.commentText?.toString() ?: ""

        String status =
            row.sapStatus?.toString()?.trim() ?: ""

        // 订单号和明细号必须存在
        if (!orderNo || !itemNo) {
            throw new IllegalArgumentException(
                "${index + 1}件目：受注番号または明細番号が未入力です"
            )
        }

        // 日期可为空；有值时才校验
        if (date) {
            try {
                LocalDate.parse(date)
            } catch (Exception e) {
                throw new IllegalArgumentException(
                    "${index + 1}件目：日付が不正です"
                )
            }
        }

        // 检查重复 Key
        String key = orderNo + "|" + itemNo

        if (!keys.add(key)) {
            throw new IllegalArgumentException(
                "${index + 1}件目：キーが重複しています"
            )
        }

        orders.add([
            orderNo: orderNo,
            itemNo : itemNo,
            date   : date,
            comment: comment,
            status : status
        ])
    }

    // 3. 生成批量 JDBC XML
    def writer = new StringWriter()
    def xml = new MarkupBuilder(writer)

    xml.root {

        orders.eachWithIndex { order, index ->

            xml."Statement${index + 1}" {

                dbTableName(action: "UPDATE_INSERT") {

                    table("IF007_EXT.ORDER_STATUS")

                    access {

                        ORDER_NO(
                            hasQuot: "Yes",
                            order.orderNo
                        )

                        ITEM_NO(
                            hasQuot: "Yes",
                            order.itemNo
                        )

                        // 日期有值时才写入 Cloud
                        if (order.date) {
                            DELIVERY_DATE(
                                hasQuot: "Yes",
                                order.date
                            )
                        }

                        // 状态有值时才写入 Cloud
                        if (order.status) {
                            EXTERNAL_STATUS(
                                hasQuot: "Yes",
                                order.status
                            )
                        }

                        // 备注允许为空字符串
                        COMMENT(
                            hasQuot: "Yes",
                            order.comment
                        )
                    }

                    key1 {

                        ORDER_NO(
                            hasQuot: "Yes",
                            order.orderNo
                        )

                        ITEM_NO(
                            hasQuot: "Yes",
                            order.itemNo
                        )
                    }
                }
            }
        }
    }

    // 4. 保存处理信息
    message.setProperty("WriteMode", "U")
    message.setProperty("RequestedCount", orders.size())

    message.setBody(writer.toString())

    return message
}