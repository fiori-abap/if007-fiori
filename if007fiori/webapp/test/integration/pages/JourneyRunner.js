sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"zrap/if007/if007fiori/test/integration/pages/OverviewList.gen",
	"zrap/if007/if007fiori/test/integration/pages/OverviewObjectPage.gen"
], function (JourneyRunner, OverviewListGenerated, OverviewObjectPageGenerated) {
    'use strict';

    const runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('zrap/if007/if007fiori') + '/test/flp.html#app-preview',
        pages: {
			onTheOverviewListGenerated: OverviewListGenerated,
			onTheOverviewObjectPageGenerated: OverviewObjectPageGenerated
        },
        async: true
    });

    return runner;
});

