import { h, icon } from '../ui.js';
import { signInButtons } from './common.js';

export function welcomeView(ctx) {
  const point = (iconName, title, text) => h('li', null,
    h('span', { class: 'welcome-icon' }, icon(iconName, 20)),
    h('span', null, h('strong', null, title), h('span', { class: 'muted' }, text)));

  return h('main', { class: 'welcome', id: 'main' },
    h('div', { class: 'welcome-card' },
      h('div', { class: 'welcome-brand' }, h('img', { src: 'icons/icon.svg', alt: '', width: 40, height: 40 }), h('span', null, 'Clubhouse')),
      h('h1', null, 'Your golf, all in one place'),
      h('p', { class: 'welcome-lead' }, 'Clubhouse reads your Gmail or Outlook for golf and keeps your scores alongside it.'),
      h('ul', { class: 'welcome-points' },
        point('flag', 'Tee times and competitions', 'Picked out of booking emails and listed by date.'),
        point('gauge', 'Handicap and results', 'Your latest index and how you did, at a glance.'),
        point('scores', 'Your scores', 'Record rounds and watch your game improve.')),
      h('div', { class: 'welcome-actions' },
        signInButtons(ctx),
        h('button', { class: 'btn btn-wide', type: 'button', onclick: ctx.actions.startDemo }, 'Look around with sample data'),
        h('button', { class: 'link-btn', type: 'button', onclick: ctx.actions.finishOnboarding }, 'Skip, I only want to track scores')),
      h('p', { class: 'welcome-privacy' }, icon('shield', 16),
        h('span', null, 'Read-only. Your email is read on this device and never sent anywhere else.'))));
}
