async function check() {
  const BASE_URL = "https://www.cutad.web.id/api/public";
  const API_KEY = "cutad_98e7ba3c88fdfe5526740ed69f59fc71267f4a69";
  
  // 1. Get rank
  const r1 = await fetch(`${BASE_URL}/netshort?action=rank&key=${API_KEY}`);
  const rank = await r1.json();
  const firstVideo = rank.data[0];
  console.log("First netshort rank video:", firstVideo);

  // 2. Search
  const rSearch = await fetch(`${BASE_URL}/netshort?action=search&q=love&key=${API_KEY}`);
  const srch = await rSearch.json();
  console.log("Search netshort result count:", srch.data?.length);
  if (srch.data?.length > 0) {
    console.log("First search item:", srch.data[0]);
    const srchId = srch.data[0].id || srch.data[0].videoFakeId;
    const r4 = await fetch(`${BASE_URL}/netshort?action=episodes&id=${srchId}&key=${API_KEY}`);
    console.log("Search item eps:", await r4.json());
  }

  // 3. fetch details/episodes 
  const r2 = await fetch(`${BASE_URL}/netshort?action=episodes&id=${firstVideo.id}&key=${API_KEY}`);
  const epData = await r2.json();
  console.log("V1 eps Data:", JSON.stringify(epData));

  // let's try with detail endpoint
  const r3 = await fetch(`${BASE_URL}/netshort?action=detail&id=${firstVideo.id}&key=${API_KEY}`);
  const detailData = await r3.json();
  console.log("Detail data:", JSON.stringify(detailData));
}
check();
