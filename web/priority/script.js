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
let priorities = undefined;
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
      inspections = await get('/queue/api/admin/all');

      let html = '<option value="" selected disabled>검차</option>';

      for (let item of inspections) {
        html += `<option value="${item.type}">${item.name}</option>`;
      }

      document.getElementById('inspection').innerHTML = html;
    } catch (e) {
      return notyf.error(`검차 대기열 정보를 가져오지 못했습니다.<br>${e.message}`);
    }

    await refresh();
  })();
});

document.addEventListener('click', async e => {
  if (e.target.closest('.delete')) {
    try {
      await post('DELETE', '/queue/api/admin/priority', {
        num: e.target.closest('.delete').dataset.target,
        inspection: e.target.closest('.delete').dataset.inspection
      });

      notyf.success('우선 검차 대상을 삭제했습니다.');
      refresh();
    } catch (e) {
      return notyf.error(`우선 검차 대상을 삭제하지 못했습니다.<br>${e.message}`);
    }
  }
});

document.getElementById('entry').addEventListener('input', e => {
  let entry = entries[e.target.value];

  if (entry) {
    document.getElementById('team').innerText = `${entry.univ} ${entry.team}`;
  } else {
    document.getElementById('team').innerText = '';
  }
});

document.getElementById('submit').addEventListener('click', async e => {
  try {
    await post('POST', '/queue/api/admin/priority', {
      num: document.getElementById('entry').value,
      inspection: document.getElementById('inspection').value,
    });

    notyf.success('우선 검차 대상이 추가되었습니다.');
    refresh();
  } catch (e) {
    return notyf.error(`우선 검차 대상을 추가하지 못했습니다.<br>${e.message}`);
  }
});

async function refresh() {
  try {
    priorities = await get('/queue/api/admin/priority');

    let html = '';

    for (let item of priorities) {
      let entry = entries[item.num];
      html += `<tr><td><span class='btn red delete' data-target='${item.num}' data-inspection='${item.inspection}'><i class='fa fa-trash'></i></span></td>`;
      html += `<td style='text-align: center;'>${inspections.find(x => x.type === item.inspection).name}</td>`;
      html += `<td><b>${item.num}</b>&ensp;${entry.univ} ${entry.team}</td></tr>`;
    }

    document.getElementById('priority-table').innerHTML = html;

  } catch (e) {
    return notyf.error(`우선순위 정보를 가져오지 못했습니다.<br>${e.message}`);
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
    throw new Error(await res.text());
  }
}
