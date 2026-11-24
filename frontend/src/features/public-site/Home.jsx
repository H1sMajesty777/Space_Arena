import { contacts } from './contacts';
import { images } from './images';
import { Prices } from './Prices';
import { AnimatedNumber, HeadlineWord } from './AnimatedText';
import { PUBLIC_KITCHEN_HOURS } from '../../config/menu';
import { SiteBrand } from '../../components/SiteBrand';

const zones = [
  {
    image: 'openSpace',
    name: 'Open Space',
    price: 300,
    description: 'Главный зал: ряд мощных ПК на RTX 5070 и мониторы 380/300 Гц.',
  },
  {
    image: 'bootcamp',
    alt: 'Bootcamp',
    name: 'Space Vip',
    price: 490,
    description: 'Командные сессии, уедененное пространсто, а также бар рядом.',
  },
  {
    image: 'psVip',
    name: 'PlayStation VIP',
    price: 1200,
    description: 'Приватная комната: PS5 Pro, ТВ 65″ 4K, стол для компании.',
  },
  {
    image: 'lounge',
    name: 'Лаунж',
    description: 'Диваны и мягкий свет — перезагрузка между матчами.',
  },
  { image: 'reception', name: 'Ресепшен', description: 'Космическое место где всегда помогут.' },
];

function Hero({ booking }) {
  return (
    <>
      <section className="w hero">
        <div className="hero-copy">
          <p className="eb">Компьютерный клуб</p>
          <h1 className="sp" aria-label="SPACE ARENA">
            <HeadlineWord text="SPACE" />
            <br />
            <span className="ac">
              <HeadlineWord text="ARENA" start={5} />
            </span>
          </h1>
          <p className="lead rv" style={{ '--d': '0.9s' }}>
            RTX 5070 Ti, OLED-мониторы 500 Гц, PlayStation 5 Pro и собственная кухня — всё в одном
            космическом пространстве.
          </p>
          <div className="act rv" style={{ '--d': '1.1s' }}>
            <a className="btn hero-booking" data-m="" {...booking}>
              Забронировать
            </a>
            <a className="btn o" href="#prices" data-m="">
              Тарифы
            </a>
            <a className="btn o" href="#menu" data-m="">
              Меню
            </a>
          </div>
        </div>
        <div className="art" data-p=".05" aria-hidden="true">
          <i className="rg" />
          <i className="rg" />
          <i className="rg" />
          <SiteBrand className="sym" src={images.symbol} />
          <span className="chip a">
            <i />
            SYSTEM ONLINE
          </span>
          <span className="chip b">ENTER THE ARENA</span>
        </div>
      </section>
      <div className="w stats">
        <div className="gl rv" data-g="">
          <b>
            <AnimatedNumber value={500} /> Гц
          </b>
          <span>OLED-мониторы</span>
        </div>
        <div className="gl rv" style={{ '--d': '0.1s' }} data-g="">
          <b>
            <AnimatedNumber value={9} />
          </b>
          <span>Форматов зон</span>
        </div>
        <div className="gl rv" style={{ '--d': '0.2s' }} data-g="">
          <b>
            <AnimatedNumber value={65} />″ 4K
          </b>
          <span>PlayStation-комнаты</span>
        </div>
        <div className="gl rv" style={{ '--d': '0.3s' }} data-g="">
          <b>Logitech</b>
          <span>Периферия в PC-зонах</span>
        </div>
      </div>
      <div className="tk" aria-hidden="true">
        <div>
          PLAY BEYOND LIMITS <i>✦</i> SPACE ARENA <i>✦</i> YOUR GAME. YOUR RULES. <i>✦</i> PLAY
          BEYOND LIMITS <i>✦</i> SPACE ARENA <i>✦</i> YOUR GAME. YOUR RULES. <i>✦</i>
        </div>
      </div>
    </>
  );
}

function Contacts({ booking, phone, telegram }) {
  return (
    <section className="s w" id="contacts">
      <p className="eb">03 / Контакты</p>
      <h2 className="rv">
        Свяжись <span className="gr">с нами</span>
      </h2>
      <div className="cg" id="cl">
        <div className="gl cc rv">
          <small>ТЕЛЕФОН</small>
          <a className="big" href={phone}>
            {contacts.phone}
          </a>
        </div>
        <div className="gl cc rv" style={{ '--d': '.1s' }}>
          <small>TELEGRAM</small>
          <a className="btn" href={telegram} target="_blank" rel="noopener">
            Открыть профиль ↗
          </a>
        </div>
        <div className="gl cc rv" style={{ '--d': '.2s' }}>
          <small>АДРЕС</small>
          <b>{contacts.address}</b>
        </div>
        <div className="gl cc rv" style={{ '--d': '.3s' }}>
          <small>РЕЖИМ РАБОТЫ</small>
          <b>{contacts.hours}</b>
        </div>
        <div className="gl cc rv" style={{ '--d': '.4s' }}>
          <small>ОНЛАЙН-БРОНИРОВАНИЕ</small>
          <b>Забронируй место в мобильном приложении</b>
          <a className="btn" {...booking}>
            Забронировать
          </a>
        </div>
      </div>
    </section>
  );
}

export function Home({ hidden, booking, phone, telegram }) {
  return (
    <main id="home" hidden={hidden}>
      <Hero booking={booking} />
      <section className="s w" id="zones">
        <p className="eb">01 / Игровые зоны</p>
        <h2 className="rv">
          Выбирай свою <span className="gr">орбиту</span>
        </h2>
        <div className="bx">
          {zones.map(({ image, name, alt, price, description }, index) => (
            <article
              key={image}
              className="z gl rv tl"
              data-tilt=""
              style={{ '--d': `${(index % 3) / 10}s` }}
            >
              <img src={images[image]} loading="lazy" alt={alt ?? name} draggable={false} />
              {price && <em>от {price} ₽ / час</em>}
              <div>
                <h3>{name}</h3>
                <p>{description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <Prices />

      <section className="s w">
        <div className="mt gl rv" id="mtz">
          <p className="eb">by Guliani · кухня {PUBLIC_KITCHEN_HOURS}</p>
          <h2 className="gr">Меню</h2>
          <p>
            Грузинская кухня, мангал, бургеры, пицца и десерты — заказывай, не отрываясь от игры.
          </p>
          <div>
            <a className="btn" href="#menu" data-m="">
              Открыть меню ✦
            </a>
          </div>
          <img
            className="fd a"
            src={images.shrimp}
            alt=""
            loading="lazy"
            data-p=".1"
            draggable={false}
          />
          <img
            className="fd b"
            src={images.halibut}
            alt=""
            loading="lazy"
            data-p="-.08"
            draggable={false}
          />
          <img
            className="fd c"
            src={images.shawarma}
            alt=""
            loading="lazy"
            data-p=".15"
            draggable={false}
          />
        </div>
      </section>

      <Contacts booking={booking} phone={phone} telegram={telegram} />
    </main>
  );
}
