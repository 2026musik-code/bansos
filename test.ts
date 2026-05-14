const fetchInfo = async (provider: string) => {
    const API_KEY = "cutad_98e7ba3c88fdfe5526740ed69f59fc71267f4a69";
    const BASE_URL = "https://www.cutad.web.id/api/public";
    
    console.log(`Getting detail for ${provider}`);
    const rankResp = await fetch(`${BASE_URL}/${provider}?action=detail&id=2048721688626987010&key=${API_KEY}`);
    const rankData = await rankResp.text();
    console.log(rankData.slice(0, 500));
}
fetchInfo('netshort');
