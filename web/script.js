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

window.addEventListener("DOMContentLoaded", async () => {
  try {
    entries = await get('/entry/all');
  } catch (e) {
    return notyf.error(`엔트리 정보를 가져올 수 없습니다.<br>${e.message}`);
  }

  if (localStorage.getItem('entry')) {
    document.getElementById('entry').value = localStorage.getItem('entry');
    document.getElementById('entry').dispatchEvent(new Event('input'));

    document.getElementById('phone').value = localStorage.getItem('phone');
    document.getElementById('phone').dispatchEvent(new Event('input'));
  }

  await refresh();
  setInterval(refresh, 10000);
});

document.getElementById('entry').addEventListener('input', e => {
  let entry = entries[e.target.value];

  if (entry) {
    document.getElementById('team').innerText = `${entry.univ} ${entry.team}`;
  } else {
    document.getElementById('team').innerText = '';
  }
});

document.getElementById('phone').addEventListener('input', e => {
  e.target.value = e.target.value
    .replace(/[^0-9]/g, '')
    .replace(/^(\d{0,3})(\d{0,4})(\d{0,4})$/g, "$1-$2-$3").replace(/(\-{1,2})$/g, "");
});

document.getElementById('check').addEventListener('click', query);

async function refresh() {
  try {
    let active = await get('/queue/api/active');
    let html = '';

    for (let item of active) {
      html += `<tr><td>${item.name}</td><td>${item.length} 팀</td></tr>`;
    }

    document.getElementById('active').innerHTML = html;

    if (localStorage.getItem('entry')) {
      await query();
    }

    if (!last) {
      last = new Date();
      setInterval(() => document.getElementById('update').innerText = ((new Date() - last) / 1000).toFixed(0));
    } else {
      last = new Date();
    }
  } catch (e) {
    return notyf.error(`대기열 업데이트에 실패했습니다.<br>${e.message}`);
  }
}

async function query() {
  let data = {
    num: document.getElementById('entry').value,
    phone: document.getElementById('phone').value.replace(/-/g, ''),
  };

  if (!data.num) {
    return err('엔트리 번호를 입력하세요.');
  }

  if (!entries[data.num]) {
    return err('존재하지 않는 엔트리 번호입니다.');
  }

  if (!data.phone) {
    return err('전화번호를 입력하세요.');
  }

  if (!/^010\d{8}$/.test(data.phone)) {
    return err('유효하지 않은 전화번호입니다.');
  }

  try {
    let result = await get(`/queue/api/state/${data.num}?phone=${data.phone}`);

    if (result.rank === -1) {
      return err('대기중인 검차가 없습니다');
    }

    document.getElementById('queue').innerText = result.queue;
    document.getElementById('rank').innerText = result.rank;

    localStorage.setItem('entry', data.num);
    localStorage.setItem('phone', data.phone);
  } catch (e) {
    return err(e.message);
  }

  function err(msg) {
    notyf.error(msg);
    document.getElementById('queue').innerText = '-';
    document.getElementById('rank').innerText = '-';

    localStorage.removeItem('entry');
    localStorage.removeItem('phone');
  }
}

/*******************************************************************************
 * utility functions                                                           *
 ******************************************************************************/
async function get(url) {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(await res.text());
  }

  const type = res.headers.get('content-type');

  if (type && type.includes('application/json')) {
    return await res.json();
  } else {
    return await res.text();
  }
}
