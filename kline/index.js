(async function() {
  const urlParams = new URLSearchParams(window.location.search);
  const symbol = urlParams.get('symbol') || 'BTCUSDT';
  let seriesData = await fetchSeriesData(symbol);
  const canvas = document.getElementById('kline');
  const YAXIS_WIDTH = 120;
  let zoom = 5;
  let translate = -50;
  renderKlines(seriesData, zoom, translate);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom += event.deltaY * -0.01;
    zoom = Math.min(Math.max(1, zoom), 100);
    translate += event.deltaX * -3;
    renderKlines(seriesData, zoom, translate);
  });
  subcribe(symbol, (data) => {
    // data: [time, open, high, low, close]
    // console.log('subcribe: ', data);
    if (data[0] === seriesData[seriesData.length - 1][0]) {
      // update kline
      seriesData[seriesData.length - 1] = data;
    } else {
      // add new kline
      seriesData.push(data);
    }
    renderKlines(seriesData, zoom, translate);
  });

  // [time, open, high, low, close][]
  function fetchSeriesData(symbol) {
    return new Promise((resolve, reject) => {
      fetch(
        `https://www.binance.com/api/v1/klines?symbol=${symbol}&interval=1m`
      )
        .then(async (res) => {
          const data = await res.json();
          const result = data.map(([time, open, high, low, close]) => [
            time,
            open,
            high,
            low,
            close,
          ]);
          resolve(result);
        })
        .catch((e) => reject(e));
    });
  }
  function subcribe(symbol, success) {
    try {
      const socket = new WebSocket(
        `wss://stream.binance.com/stream?streams=${symbol.toLowerCase()}@kline_1m`
      );
      socket.onmessage = (e) => {
        const res = JSON.parse(e.data);
        const { t, o, h, l, c } = res.data.k;
        success([t, o, h, l, c]);
      };
    } catch (e) {
      console.error(e.message);
    }
  }
  function fixDpi(canvas) {
    const dpi = window.devicePixelRatio;
    const style_height = +getComputedStyle(canvas)
      .getPropertyValue('height')
      .slice(0, -2);
    const style_width = +getComputedStyle(canvas)
      .getPropertyValue('width')
      .slice(0, -2);
    canvas.setAttribute('height', style_height * dpi);
    canvas.setAttribute('width', style_width * dpi);
  }
  function renderKlines(seriesData, zoomFactor = 1, translate = 0) {
    const canvas = document.getElementById('kline');
    fixDpi(canvas);
    const ctx = canvas.getContext('2d');
    const CANVAS_WIDTH = canvas.width - YAXIS_WIDTH;
    const CANVAS_HEIGHT = canvas.height;
    const KLINE_WIDTH = (zoomFactor * CANVAS_WIDTH) / seriesData.length;
    const KLINE_MARGIN = KLINE_WIDTH * 0.1;

    // current symbol
    ctx.font = '7em serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(75,80,90,0.1)';
    ctx.fillText(symbol, CANVAS_WIDTH * 0.25, CANVAS_HEIGHT * 0.5);

    const kLinesInViewStartIndex = Math.round(
      _.clamp(
        seriesData.length - (CANVAS_WIDTH + translate) / KLINE_WIDTH - 1,
        0,
        seriesData.length - 2
      )
    );
    const kLinesInViewEndIndex = Math.round(
      _.clamp(
        seriesData.length - translate / KLINE_WIDTH - 1,
        1,
        seriesData.length - 1
      )
    );
    const yMin = _.minBy(
      seriesData.slice(kLinesInViewStartIndex, kLinesInViewEndIndex),
      (data) => data[3]
    )[3];
    const yMax = _.maxBy(
      seriesData.slice(kLinesInViewStartIndex, kLinesInViewEndIndex),
      (data) => data[2]
    )[2];
    ctx.beginPath();
    seriesData.forEach((data, idx) => {
      const t = data[0];
      const h = new Big(data[2]);
      const x =
        idx * KLINE_WIDTH +
        CANVAS_WIDTH -
        seriesData.length * KLINE_WIDTH +
        translate;
      const hy =
        CANVAS_HEIGHT -
        (h.minus(yMin).toNumber() / new Big(yMax).minus(yMin).toNumber()) *
          CANVAS_HEIGHT;
      if (idx === 0) {
        ctx.moveTo(x, yMin);
      } else if (idx === seriesData.length - 1) {
        ctx.lineTo(x, yMin);
      } else {
        ctx.lineTo(x, hy);
      }
      ctx.fillStyle = '#F8D12F';
    });
    ctx.fill();

    // yaxis
    ctx.fillStyle = 'rgba(20,21,26,1)';
    ctx.fillRect(CANVAS_WIDTH, 0, YAXIS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = 'rgba(75,80,90,1)';
    ctx.strokeStyle = 'rgba(75,80,90,1)';
    ctx.beginPath();
    ctx.moveTo(CANVAS_WIDTH, 0);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.closePath();
    ctx.stroke();

    const ticks = calculateTicks(yMin, yMax, 15);
    ticks.forEach((tick, idx) => {
      if (idx === 0) return; //dont render first tick so axis looks better
      ctx.moveTo(
        CANVAS_WIDTH,
        CANVAS_HEIGHT - (CANVAS_HEIGHT * idx) / ticks.length
      );
      ctx.lineTo(
        CANVAS_WIDTH + 15,
        CANVAS_HEIGHT - (CANVAS_HEIGHT * idx) / ticks.length
      );
      ctx.closePath();
      ctx.stroke();

      ctx.font = '1em serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        new Big(tick).prec(10),
        CANVAS_WIDTH + 25,
        CANVAS_HEIGHT - (CANVAS_HEIGHT * idx) / ticks.length
      );
    });

    // current price
    const currentPrice = seriesData[kLinesInViewEndIndex];
    const o = new Big(currentPrice[1]);
    const c = new Big(currentPrice[4]);
    const yOffset =
      CANVAS_HEIGHT -
      (c.minus(yMin).toNumber() / new Big(yMax).minus(yMin).toNumber()) *
        CANVAS_HEIGHT;
    ctx.setLineDash([5, 15]);
    ctx.strokeStyle = o.gt(c) ? 'rgba(203,61,78)' : 'rgba(98,187,137,1)';
    ctx.beginPath();
    ctx.moveTo(CANVAS_WIDTH, yOffset);
    ctx.lineTo(0, yOffset);
    ctx.closePath();
    ctx.stroke();

    ctx.font = '1em serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = o.gt(c) ? 'rgba(203,61,78)' : 'rgba(98,187,137,1)';
    ctx.fillText(c.toNumber(), CANVAS_WIDTH + 25, yOffset);

    // browser tab text
    document.title = c.toNumber() + ' | ' + symbol;
  }
  function calculateTicks(min, max, tickCount) {
    var span = max - min,
      step = Math.pow(10, Math.floor(Math.log(span / tickCount) / Math.LN10)),
      err = (tickCount / span) * step;

    // Filter ticks to get closer to the desired count.
    if (err <= 0.15) step *= 10;
    else if (err <= 0.35) step *= 5;
    else if (err <= 0.75) step *= 2;

    // Round start and stop values to step interval.
    var tstart = Math.ceil(min / step) * step,
      tstop = Math.floor(max / step) * step + step * 0.5,
      ticks = [];

    // now generate ticks
    for (i = tstart; i < tstop; i += step) {
      ticks.push(i);
    }
    return ticks;
  }
})();
