const fetchInfo = async () => {
    const API_KEY = "cutad_98e7ba3c88fdfe5526740ed69f59fc71267f4a69";
    const BASE_URL = "https://www.cutad.web.id/api/public";
    
    console.log("Freereels rank tags:");
    const resp = await fetch(`${BASE_URL}/freereels?action=rank&key=${API_KEY}`);
    const json = await resp.json();
    const tags = new Set();
    if (json.data && Array.isArray(json.data)) {
        json.data.forEach((d: any) => {
            if (d.tags) d.tags.forEach((t: string) => tags.add(t));
            if (d.labels) d.labels.forEach((t: string) => tags.add(t));
        });
    }
    console.log([...tags]);
    
    console.log("Netshort rank tags:");
    const resp2 = await fetch(`${BASE_URL}/netshort?action=rank&key=${API_KEY}`);
    const json2 = await resp2.json();
    const tags2 = new Set();
    if (json2.data && Array.isArray(json2.data)) {
        json2.data.forEach((d: any) => {
            if (d.tags) d.tags.forEach((t: string) => tags2.add(t));
            if (d.labels) d.labels.forEach((t: string) => tags2.add(t));
        });
    }
    console.log([...tags2]);
    
    console.log("Testing search for tag Revenge in freereels...");
    const respSearch = await fetch(`${BASE_URL}/freereels?action=search&q=Revenge&key=${API_KEY}`);
    const jsonSearch = await respSearch.json();
    console.log("Search results count:", jsonSearch.data ? jsonSearch.data.length : 0);
}
fetchInfo();
