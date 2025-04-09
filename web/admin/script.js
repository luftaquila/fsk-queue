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
let last = undefined;

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

  // draw advanced menu
  await (async () => {
    try {
    let inspections = await get('/queue/admin/all');
    let html = '';

    for (let item of inspections) {
      html += `<div><label for='chk-${item.type}'><input type="checkbox" id="chk-${item.type}" class='activate' ${item.active ? 'checked' : ''}> ${item.name}</div></label>`;
    }

    document.getElementById('advanced').innerHTML = html;
    } catch (e) {
      return notyf.error(`대기열 정보를 가져오지 못했습니다.<br>${e.message}`);
    }
  })();

  await refresh();
  setInterval(refresh, 5000);
});

document.addEventListener('click', async e => {
  if (e.target.matches('.tab')) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    e.target.classList.add('active');
    document.getElementById(`${e.target.id}-table`).classList.add('active');

    localStorage.setItem('current', e.target.id);
    refresh_queue(e.target.id);
  }

  else if (e.target.closest('.delete')) {
    try {
      let current = localStorage.getItem('current');

      await post('DELETE', `/queue/admin/${current}`, {
        num: e.target.closest('.delete').dataset.target
      });

      refresh_queue(current);
    } catch (e) {
      return notyf.error(`엔트리를 삭제하지 못했습니다.<br>${e.message}`);
    }
  }
});

document.addEventListener('change', async e => {
  if (e.target.matches('.activate')) {
    try {
      await post('PATCH', `/queue/admin/${e.target.id.replace('chk-', '')}`, {
        active: e.target.checked
      });
    } catch (e) {
      return notyf.error(`대기열 활성화 상태를 변경하지 못했습니다.<br>${e.message}`);
    }
  }
});


/*******************************************************************************
 * functions                                                                   *
 ******************************************************************************/
async function refresh() {
  // draw tabs
  try {
    let active = await get('/queue/active');

    if (active.length) {
      let types = '';
      let list = '';

      document.querySelectorAll(('.activate')).forEach(item => item.checked = false);

      for (let item of active) {
        types += `<div class="tab" id="${item.type}">${item.name}</div>`;
        list += `<table class="tab-content" id="${item.type}-table"></div>`;
        document.getElementById(`chk-${item.type}`).checked = true;
      }

      document.getElementById('tabs').innerHTML = types;
      document.getElementById('tab-container').innerHTML = list;

      let current = localStorage.getItem('current');
      let target = document.getElementById(current);

      if (current && target) {
        target.click();
      }
    }

    if (!last) {
      last = new Date();
      setInterval(() => document.getElementById('update').innerText = ((new Date() - last) / 1000).toFixed(0));
    } else {
      last = new Date();
    }
  } catch (e) {
    return notyf.error(`활성 대기열 정보를 가져오지 못했습니다.<br>${e.message}`);
  }
}

async function refresh_queue(inspection) {
  try {
    let queue = await get(`/queue/admin/${inspection}`);
    let html = '<tr>';

    for (let item of queue) {
      let entry = entries[item.num];
      html += `<td><span class='btn red delete' data-target='${item.num}'><i class='fa fa-trash'></i></span></td>`;
      html += `<td style='text-align: center;'>${item.num}</td>`;
      html += `<td>${entry.univ} ${entry.team}<br>${phone(item.phone)}</td></tr>`;
    }

    document.getElementById(`${inspection}-table`).innerHTML = html;
    document.getElementById('status').innerText = queue.length;

    if (!last) {
      last = new Date();
      setInterval(() => document.getElementById('update').innerText = ((new Date() - last) / 1000).toFixed(0));
    } else {
      last = new Date();
    }
  } catch (e) {
    return notyf.error(`대기열을 가져오지 못했습니다.<br>${e.message}`);
  }
}

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
    throw new Error(`failed to post: ${await res.text()}`);
  }
}

function phone(number) {
  return number.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
}
