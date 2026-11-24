import { useState } from 'react';
import { PRICES } from './content';
import { images } from './images';
import { AnimatedNumber } from './AnimatedText';

const columns = ['1 час', 'День', 'Ночь'];
const backdrop = {
  '--price-backdrop': `url("${images.priceBg}")`,
  '--price-backdrop-mobile': `url("${images.priceBgMobile}")`,
};

export function Prices() {
  const [mode, setMode] = useState('weekday');

  return (
    <section className="s w" id="prices">
      <p className="eb">02 / Прайс-лист</p>
      <h2 className="rv">
        Тарифы <span className="gr">клуба</span>
      </h2>
      <div
        className={`tabs rv${mode === 'weekend' ? ' r' : ''}`}
        role="group"
        aria-label="Дни тарифа"
      >
        <i aria-hidden="true" />
        {Object.entries({ weekday: 'Будни', weekend: 'Выходные' }).map(([key, label]) => (
          <button
            key={key}
            className={key === mode ? 'on' : undefined}
            type="button"
            aria-pressed={key === mode}
            onClick={() => setMode(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="tm">
        <span>День · 10:00 – 18:00</span>
        <span>Ночь · 23:00 – 09:00</span>
      </div>
      <div className="pp rv" id="pp" style={backdrop}>
        <div id="rows" key={mode}>
          {PRICES.map((row, index) => (
            <div className="row" key={row.name} style={{ '--i': index }}>
              <div className="rn">
                <h3>{row.name}</h3>
                <p>{row.specs}</p>
              </div>
              {row[mode].map((price, column) => (
                <div className="pc" key={columns[column]}>
                  <i>{columns[column]}</i>
                  <AnimatedNumber value={price} rubles />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className="pn">
        Будний тариф — с ПН 00:00 по ПТ 18:00 · Периферия Logitech во всех PC-зонах
      </p>
    </section>
  );
}
