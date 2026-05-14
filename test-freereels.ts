const fetchInfo = async () => {
    const API_KEY = "cutad_98e7ba3c88fdfe5526740ed69f59fc71267f4a69";
    const BASE_URL = "https://www.cutad.web.id/api/public";
    
    // freereels rank
    const resp = await fetch(`${BASE_URL}/freereels?action=rank&key=${API_KEY}`);
    const json = await resp.json();
    const drama = json.data[0];
    console.log(drama);

    const epResp = await fetch(`${BASE_URL}/freereels?action=episodes&id=${drama.id || drama.fakeId}&key=${API_KEY}`);
    const epjson = await epResp.json();
    console.log(epjson.data[0]);

    if(epjson.data[0]) {
        const fakeId = epjson.data[0].videoFakeId || epjson.data[0].id;
        console.log(`Getting stream for fakeId: ${fakeId}`);
        const streamResp = await fetch(`${BASE_URL}/freereels?action=stream&id=${encodeURIComponent(fakeId)}&key=${API_KEY}`);
        const streamText = await streamResp.text();
        console.log(streamText.slice(0, 300));
    }
}
fetchInfo();
