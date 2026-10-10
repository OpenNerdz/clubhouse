import { h, icon } from '../ui.js';
import { signInButtons } from './common.js';

export function welcomeView(ctx) {
  const point = (n, title, text) => h('li', null,
    h('span', { class: 'point-n', 'aria-hidden': 'true' }, n),
    h('span', null, h('strong', null, title), h('span', null, text)));

  return h('main', { class: 'welcome', id: 'main' },
    h('section', { class: 'welcome-hero' },
      h('div', { class: 'crest' },
        h('img', { src: 'icons/icon.svg', alt: '', width: 72, height: 72 }),
        h('p', { class: 'crest-name' }, 'Clubhouse'),
        h('p', { class: 'crest-motto' }, 'Your golf, kept in order'))),
    h('section', { class: 'welcome-body' },
      h('div', { class: 'welcome-card' },
        h('h1', null, 'Everything golf, in one place'),
        h('p', { class: 'welcome-lead' }, 'Clubhouse reads your Gmail or Outlook for golf, and keeps your scores alongside it.'),
        h('ol', { class: 'welcome-points' },
          point('1', 'Tee times and competitions', 'Picked out of booking emails and set out by date.'),
          point('2', 'Handicap and results', 'Your latest index and how you finished, at a glance.'),
          point('3', 'Your scorecard', 'Every round recorded, the good ones circled.')),
        h('div', { class: 'welcome-actions' },
          signInButtons(ctx),
          h('div', { class: 'or' }, h('span', null, 'or')),
          h('button', { class: 'btn btn-wide', type: 'button', onclick: ctx.actions.startDemo }, 'Look around with sample data'),
          h('button', { class: 'link-btn', type: 'button', onclick: ctx.actions.finishOnboarding }, 'Skip, I only want to keep scores')),
        h('p', { class: 'welcome-privacy' }, icon('shield', 16),
          h('span', null, 'Read-only. Your email is read on this device and never sent anywhere else.')))));
}
