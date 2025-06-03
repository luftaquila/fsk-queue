let notyf = new Notyf({
  ripple: false,
  duration: 3500,
  types: [{
    type: 'warn',
    background: 'orange',
    icon: {
      className: 'fa fa-exclamation-triangle',
      tagName: 'i',
      color: 'white',
    }
  }]
});

let entries = undefined;
let inspections = undefined;

// init UI and event handlers
window.addEventListener("DOMContentLoaded", async () => {
  // load entries
  await (async () => {
    try {
      entries = await get('/entry/all');
    } catch (e) {
      return notyf.error(`엔트리 정보를 가져오지 못했습니다.<br>${e.message}`);
    }
  })();

  await (async () => {
    try {
      inspections = await get('/queue/admin/all');

      let html = '<option value="" selected disabled>검차</option>';

      for (let item of inspections) {
        html += `<option value="${item.type}">${item.name}</option>`;
      }

      document.getElementById('inspection').innerHTML = html;
    } catch (e) {
      return notyf.error(`검차 대기열 정보를 가져오지 못했습니다.<br>${e.message}`);
    }
  })();
});

document.addEventListener('click', async e => {

});

document.addEventListener('change', async e => {

});

document.getElementById('entry').addEventListener('input', e => {
  let entry = entries[e.target.value];

  if (entry) {
    document.getElementById('team').innerText = `${entry.univ} ${entry.team}`;
  } else {
    document.getElementById('team').innerText = '';
  }
});


/*******************************************************************************
 * utility functions                                                           *
 ******************************************************************************/
async function get(url) {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`failed to get ${url}: ${res.status}`);
  }

  const type = res.headers.get('content-type');

  if (type && type.includes('application/json')) {
    return await res.json();
  } else {
    return await res.text();
  }
}

async function post(method, url, data) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }
}
