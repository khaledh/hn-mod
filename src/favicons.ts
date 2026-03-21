// Favicon icons for story titles
//
// Prepends a small favicon from DuckDuckGo's icon service to each story link.

const ICON_SERVICE = 'https://icons.duckduckgo.com/ip3';

/** Add favicon icons to all story title links on the page */
export function addFavicons(): void {
  for (const link of document.querySelectorAll<HTMLAnchorElement>('.titleline > a')) {
    let domain: string;
    try {
      domain = new URL(link.href).hostname;
    } catch {
      continue;
    }

    const img = document.createElement('img');
    img.src = `${ICON_SERVICE}/${domain}.ico`;
    img.width = 12;
    img.height = 12;

    const container = document.createElement('span');
    container.className = 'hn-mod-favicon';
    container.style.paddingRight = '0.4em';
    container.style.paddingLeft = '0.25em';
    container.appendChild(img);

    link.prepend(container);
  }
}
