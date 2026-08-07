const axios = require('axios');
axios.post('http://localhost:3001/api/v1/auth/login', { email: 'admin@test.com', password: 'password' })
  .then(r => axios.get('http://localhost:3001/api/v1/recruitment/applications?eligible_for_offer=true', {
    headers: { Authorization: 'Bearer ' + r.data.data.accessToken, 'x-portal-host': 'localhost:3000' }
  }))
  .then(r => console.log(JSON.stringify(r.data, null, 2)))
  .catch(e => console.error(e.response ? e.response.data : e.message));
