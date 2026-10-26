import com.sap.gateway.ip.core.customdev.util.Message
import groovy.util.XmlSlurper
import groovy.json.JsonOutput

Message processData(Message message) {

    // 1. 取得 JDBC 返回的 XML
    String body = message.getBody(String)

    def xml = new XmlSlurper(false, false).parseText(body)

    // 2. 读取 UPDATE_INSERT 的执行结果
    def resultCounts = xml.depthFirst().findAll { node ->

        String name = node.name().toString()

        name == 'update_insert_count' ||
        name == 'update_count' ||
        name == 'insert_count'
    }

    if (resultCounts.isEmpty()) {
        throw new IllegalStateException(
            "JDBC UPDATE_INSERT 実行結果が取得できません"
        )
    }

    // 3. 统计实际处理件数
    int processedCount = 0

    resultCounts.each { node ->

        String countText = node.text().trim()

        if (!(countText ==~ /[0-9]+/)) {
            throw new IllegalStateException(
                "JDBC 実行件数が不正です"
            )
        }

        processedCount += countText.toInteger()
    }

    // 4. 取得最初请求的件数
    int requestedCount = (
        message.getProperty("RequestedCount") ?: "0"
    ).toString().toInteger()

    // 5. 返回实际处理结果
    def response = [
        RequestedCount: requestedCount,
        ProcessedCount: processedCount,
        SuccessCount  : processedCount
    ]

    message.setBody(
        JsonOutput.toJson(response)
    )

    message.setHeader(
        "Content-Type",
        "application/json"
    )

    return message
}