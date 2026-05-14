fetch('http://localhost:3000/api/providers', {
  headers: {
    'Referer': 'http://localhost:3000/',
    'Host': 'localhost:3000',
    'User-Agent': 'Mozilla/5.0 (Something else)'
  }
}).then(res => res.text()).then(text => console.log('STATUS:', text)).catch(e => console.error(e));
