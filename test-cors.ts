const checkCORS = async () => {
    try {
        const url = "https://video-v5.mydramawave.com/vt/f9567469-fb1a-4055-98fc-6be0f56896cc/h264-9bf2998f-4ee0-44af-ad99-e18d19bf8cdd.m3u8";
        const GETres = await fetch(url);
        const text = await GETres.text();
        
        console.log("M3U8 file:");
        console.log(text.slice(0, 300));
        
        let tsUrl = "";
        const lines = text.split('\n');
        for (const line of lines) {
            if (line && !line.startsWith('#')) {
                if (line.startsWith('http')) {
                    tsUrl = line;
                } else {
                    tsUrl = new URL(line, url).href;
                }
                break;
            }
        }
        
        if (tsUrl) {
            console.log(`Fetching TS chunk: ${tsUrl}`);
            const tsRes = await fetch(tsUrl, { method: 'OPTIONS' });
            console.log('TS OPTIONS headers:', Object.fromEntries(tsRes.headers.entries()));
        }
    } catch(e) {
        console.error(e);
    }
}
checkCORS();
