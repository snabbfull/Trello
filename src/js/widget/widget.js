export class Widget {
  constructor(element) {
    this.element = element;
    this.addCard = this.addCard.bind(this);
    this.deleteInputContainer = this.deleteInputContainer.bind(this);
    this.addCardBtn = this.addCardBtn.bind(this);
    this.onDeleteCardClick = this.onDeleteCardClick.bind(this);
    this.onColumnMouseDown = this.onColumnMouseDown.bind(this);
    this.onDocumentMouseMove = this.onDocumentMouseMove.bind(this);
    this.onDocumentMouseUp = this.onDocumentMouseUp.bind(this);

    this.link = this.element.querySelector(".addLink");
    this.link.addEventListener("click", this.addCard);

    this.inputContainer = document.createElement("div");
    this.inputContainer.classList.add("inputContainer");

    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.placeholder = "Enter a title for this card...";
    this.input.classList.add("input-title");

    this.addBtn = document.createElement("button");
    this.addBtn.classList.add("addBtn");
    this.addBtn.textContent = "Add Card";
    this.addBtn.type = "button";
    this.addBtn.addEventListener("click", this.addCardBtn);

    this.deleteBtn = document.createElement("span");
    this.deleteBtn.classList.add("deleteBtn");
    this.deleteBtn.textContent = "✖";
    this.deleteBtn.addEventListener("click", this.deleteInputContainer);

    this.draggedCard = undefined;
    this.placeholder = undefined;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.dropColumnEl = this.element;

    // eslint-disable-next-line prettier/prettier
    this.columnKey = ["todo", "inprogress", "done"].find((c) => this.element.classList.contains(c)) || "todo";

    this.element.addEventListener("mousedown", this.onColumnMouseDown);

    this.restoreCards();
  }

  addCard(e) {
    e.preventDefault();
    this.inputContainer.append(this.input);
    this.inputContainer.append(this.addBtn);
    this.inputContainer.append(this.deleteBtn);
    this.element.insertBefore(this.inputContainer, this.link);
    this.input.focus();
  }

  addCardBtn() {
    const text = this.input.value.trim();
    if (!text) return;

    const cardData = { id: crypto.randomUUID(), text };
    this.appendCardDom(cardData);
    this.persistAdd(cardData);

    this.input.value = "";
    this.inputContainer.remove();
  }

  deleteInputContainer() {
    this.inputContainer.remove();
  }

  onDeleteCardClick(e) {
    const card = e.currentTarget.closest(".newCard");
    if (!card) return;
    const id = card.dataset.id;
    const colEl = card.closest(".column") || this.element;
    card.remove();
    this.persistRemoveInElement(colEl, id);
  }

  onColumnMouseDown(e) {
    // Do not start drag when clicking delete button
    if (e.target.closest(".deleteBtn")) return;

    const card = e.target.closest(".newCard");
    if (!card || !this.element.contains(card)) return;
    e.preventDefault();

    const rect = card.getBoundingClientRect();
    this.dragOffsetX = e.clientX - rect.left;
    this.dragOffsetY = e.clientY - rect.top;

    this.draggedCard = card;
    this.draggedCard.classList.add("dragged");
    this.draggedCard.style.width = rect.width + "px";

    this.placeholder = document.createElement("div");
    this.placeholder.classList.add("placeholder");
    this.placeholder.style.height = rect.height + "px";
    this.element.insertBefore(this.placeholder, this.draggedCard.nextSibling);

    document.addEventListener("mousemove", this.onDocumentMouseMove);
    document.addEventListener("mouseup", this.onDocumentMouseUp);
  }

  onDocumentMouseMove(e) {
    if (!this.draggedCard) return;

    // Move visually following the cursor
    const x = e.clientX - this.dragOffsetX;
    const y = e.clientY - this.dragOffsetY;
    this.draggedCard.style.top = Math.max(0, y) + "px";
    this.draggedCard.style.left = Math.max(0, x) + "px";

    // Detect column under cursor
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const colEl = under ? under.closest(".column") : null;
    if (!colEl) return;
    this.dropColumnEl = colEl;

    // Find insertion point within target column
    const cards = Array.from(colEl.querySelectorAll(".newCard:not(.dragged)"));
    let next = null;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) {
        next = c;
        break;
      }
    }
    const linkEl = colEl.querySelector(".addLink");
    if (next) {
      colEl.insertBefore(this.placeholder, next);
    } else if (linkEl) {
      colEl.insertBefore(this.placeholder, linkEl);
    } else {
      colEl.appendChild(this.placeholder);
    }
  }

  onDocumentMouseUp() {
    if (!this.draggedCard) return;

    const sourceColEl = this.draggedCard.closest(".column") || this.element;
    const targetColEl = this.dropColumnEl || this.element;

    this.draggedCard.classList.remove("dragged");
    this.draggedCard.style.top = "";
    this.draggedCard.style.left = "";
    this.draggedCard.style.width = "";
    targetColEl.insertBefore(this.draggedCard, this.placeholder);
    this.placeholder.remove();
    this.placeholder = undefined;

    this.persistOrderForElement(sourceColEl);
    if (targetColEl !== sourceColEl) {
      this.persistOrderForElement(targetColEl);
    }

    this.draggedCard = undefined;
    document.removeEventListener("mousemove", this.onDocumentMouseMove);
    document.removeEventListener("mouseup", this.onDocumentMouseUp);
  }

  createDeleteButton() {
    const btn = document.createElement("span");
    btn.classList.add("deleteBtn");
    btn.textContent = "✖";
    btn.setAttribute("aria-label", "Delete card");
    btn.addEventListener("click", this.onDeleteCardClick);
    return btn;
  }

  appendCardDom(cardData) {
    const card = document.createElement("div");
    card.classList.add("newCard");
    card.dataset.id = cardData.id;
    card.textContent = cardData.text;
    const del = this.createDeleteButton();
    card.appendChild(del);
    this.element.insertBefore(card, this.link);
  }

  storageKeyForElement(colEl) {
    // eslint-disable-next-line prettier/prettier
    const key = ["todo", "inprogress", "done"].find((c) => colEl.classList.contains(c)) || this.columnKey;
    return `cards:${key}`;
  }

  readCardsForElement(colEl) {
    const key = this.storageKeyForElement(colEl);
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  }

  writeCardsForElement(colEl, cards) {
    const key = this.storageKeyForElement(colEl);
    localStorage.setItem(key, JSON.stringify(cards));
  }

  persistAdd(card) {
    const cards = this.readCardsForElement(this.element);
    cards.push(card);
    this.writeCardsForElement(this.element, cards);
  }

  persistRemoveInElement(colEl, id) {
    const cards = this.readCardsForElement(colEl).filter((c) => c.id !== id);
    this.writeCardsForElement(colEl, cards);
  }

  persistOrderForElement(colEl) {
    const cards = Array.from(colEl.querySelectorAll(".newCard")).map((c) => ({
      id: c.dataset.id,
      text: c.childNodes[0] ? c.childNodes[0].textContent : "",
    }));
    this.writeCardsForElement(colEl, cards);
  }

  restoreCards() {
    const cards = this.readCardsForElement(this.element);
    cards.forEach((c) => this.appendCardDom(c));
  }
}
