export const mouse = {
  x: 0,
  y: 0
}

const mouseListener = (ev: MouseEvent) => {
  mouse.x = ev.pageX
  mouse.y = ev.pageY
}

document.addEventListener('mousemove', mouseListener)
