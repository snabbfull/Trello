import { Widget } from "./widget/widget.js";

const widgetContainer = document.querySelectorAll(".column");
widgetContainer.forEach((widget) => {
  new Widget(widget);
});
