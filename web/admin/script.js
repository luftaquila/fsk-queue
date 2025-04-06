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
let active = undefined;

// init UI and event handlers
window.addEventListener("DOMContentLoaded", async () => {
  entries = await get('/entry/all');
  inspections = await get('/queue/admin/all');

  active = await get('/queue/active');

  let types = '';
  let list = '';

  for (let item of active) {
    types += `<div class="tab" id="${item.type}">${item.name}</div>`;
    list += `<div class="tab-content" id="${item.type}-container"></div>`;
  }

  document.getElementById('tabs').innerHTML = types;
  document.getElementById('tab-container').innerHTML = list;


  console.log(entries);
  console.log(inspections);
  console.log(active);

  document.addEventListener('click', async e => {
    if (e.target.matches('.tab')) {
      document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
      e.target.classList.add('active');
      document.getElementById(`${e.target.id}-container`).classList.add('active');

      let queue = await get(`/queue/admin/${e.target.id}`);
      console.log(queue);

    }
  });


});

/*******************************************************************************
 * utility functions                                                           *
 ******************************************************************************/
async function get(url) {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`failed to get: ${res.status}`);
  }

  const type = res.headers.get('content-type');

  if (type && type.includes('application/json')) {
    return await res.json();
  } else {
    return await res.text();
  }
}

async function post(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    throw new Error(`failed to post: ${await res.text()}`);
  }
}
