function widgetsOverlap(first, second) {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

function isFree(widget, placed) {
  return (
    widget.x >= 1 &&
    widget.x + widget.width <= 13 &&
    widget.y >= 1 &&
    !placed.some((other) => widgetsOverlap(widget, other))
  );
}

function findFreePosition(widget, placed) {
  const directions = ['up', 'down', 'left', 'right'];
  const candidates = [];
  placed
    .filter((other) => widgetsOverlap(widget, other))
    .forEach((other) => {
      directions.forEach((direction) => {
        const candidate = { ...widget };
        if (direction === 'up') candidate.y = other.y - widget.height;
        if (direction === 'down') candidate.y = other.y + other.height;
        if (direction === 'left') candidate.x = other.x - widget.width;
        if (direction === 'right') candidate.x = other.x + other.width;
        candidates.push(candidate);
      });
    });
  const preferred = candidates.find((candidate) => isFree(candidate, placed));
  if (preferred) return preferred;

  for (
    let y = 1;
    y <= Math.max(12, ...placed.map((item) => item.y + item.height));
    y += 1
  ) {
    for (let x = 1; x <= 13 - widget.width; x += 1) {
      const candidate = { ...widget, x, y };
      if (isFree(candidate, placed)) return candidate;
    }
  }
  return {
    ...widget,
    x: 1,
    y: Math.max(1, ...placed.map((item) => item.y + item.height)),
  };
}

export function resolveLayout(widgets, priorityId) {
  const priority = widgets.find((widget) => widget.id === priorityId);
  const others = widgets.filter((widget) => widget.id !== priorityId);
  const placed = priority ? [priority] : [];
  others.forEach((widget) =>
    placed.push(
      isFree(widget, placed) ? widget : findFreePosition(widget, placed),
    ),
  );
  return placed;
}
