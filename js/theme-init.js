// Applies the saved theme and text size before the page draws, so it doesn't flash.
try {
  var a = JSON.parse(localStorage.getItem('clubhouse-appearance') || '{}');
  if (a.theme === 'light' || a.theme === 'dark') document.documentElement.dataset.theme = a.theme;
  if (a.textSize === 'large') document.documentElement.dataset.size = 'large';
} catch (e) { /* storage unavailable */ }
