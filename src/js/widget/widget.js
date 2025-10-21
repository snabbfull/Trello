/* eslint-disable no-empty */
/* eslint-disable prettier/prettier */
export class Widget {
  constructor(element) {
    this.element = element;
    this.TTL_MS = 5 * 60 * 1000;

    // bind
    this.addCard = this.addCard.bind(this);
    this.addCardBtn = this.addCardBtn.bind(this);
    this.deleteInputContainer = this.deleteInputContainer.bind(this);
    this.onDeleteCardClick = this.onDeleteCardClick.bind(this);
    this.onColumnMouseDown = this.onColumnMouseDown.bind(this);
    this.onDocumentMouseMove = this.onDocumentMouseMove.bind(this);
    this.onDocumentMouseUp = this.onDocumentMouseUp.bind(this);
    this.onWindowPointerLeave = this.onWindowPointerLeave.bind(this);
    this.onVisibilityChange = this.onVisibilityChange.bind(this);

    // elements & state
    this.link = this.element.querySelector(".addLink");
    this.linkOriginalText = this.link ? this.link.textContent : "+ Add another card";
    if (this.link) this.link.addEventListener("click", this.addCard);

    // Reusable input container (one per Widget instance)
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

    // drag state
    this.draggedCard = undefined;
    this.placeholder = undefined;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.dropColumnEl = this.element;
    this.originalParent = null;
    this.originalNextSibling = null;

    this.columnKey =
      ["todo", "inprogress", "done"].find((c) =>
        this.element.classList.contains(c)
      ) || "todo";

    // listen for down events on the column container (delegation)
    this.element.addEventListener("mousedown", this.onColumnMouseDown);

    // restore and schedule cleanup
    this.restoreCards();
    this.scheduleExpiryForElement(this.element);
  }

  // ---------- Add card UI ----------
  addCard(e) {
    e.preventDefault();
    // if inputContainer is already shown in this column, don't open another
    if (this.inputContainer.isConnected) {
      // If somehow another column's input exists, remove it first
      if (this.inputContainer.closest(".column") === this.element) {
        this.input.focus();
        return;
      } else {
        this.inputContainer.remove();
      }
    }

    // Populate inputContainer fresh (ensures children order)
    this.inputContainer.replaceChildren(this.input, this.addBtn, this.deleteBtn);
    // change link text to a short variant and disable further clicks while open
    if (this.link) {
      this.link.dataset.prevText = this.link.textContent;
      this.link.textContent = "+ Add card";
      this.link.setAttribute("aria-expanded", "true");
      this.link.style.pointerEvents = "none";
      this.link.style.opacity = "0.6";
    }

    this.link.before(this.inputContainer);
    this.input.focus();
  }

  addCardBtn() {
    const text = this.input.value.trim();
    if (!text) return;

    const cardData = { id: crypto.randomUUID(), text };
    this.appendCardDom(cardData);
    this.persistAdd(cardData);

    this.cleanupInputContainer();
  }

  deleteInputContainer() {
    this.cleanupInputContainer();
  }

  cleanupInputContainer() {
    if (this.inputContainer.isConnected) this.inputContainer.remove();
    if (this.link) {
      this.link.textContent = this.link.dataset.prevText || this.linkOriginalText;
      this.link.removeAttribute("aria-expanded");
      this.link.style.pointerEvents = "";
      this.link.style.opacity = "";
      delete this.link.dataset.prevText;
    }
    this.input.value = "";
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
    // text node go first so deleteBtn is separate child
    const textNode = document.createTextNode(cardData.text);
    card.append(textNode);
    const del = this.createDeleteButton();
    card.append(del);
    // if link exists in column, insert before it, otherwise append to column
    const linkEl = this.element.querySelector(".addLink");
    if (linkEl) linkEl.before(card);
    else this.element.append(card);
  }

  // ---------- Delete ----------
  onDeleteCardClick(e) {
    const card = e.currentTarget.closest(".newCard");
    if (!card) return;
    const id = card.dataset.id;
    const colEl = card.closest(".column") || this.element;
    card.remove();
    this.persistRemoveInElement(colEl, id);
  }

  // ---------- Drag & Drop ----------
  onColumnMouseDown(e) {
    // ignore clicks on the add input controls etc
    if (e.target.closest(".deleteBtn")) return;
    if (e.target.closest(".addBtn") || e.target.closest(".input-title")) return;

    const card = e.target.closest(".newCard");
    if (!card || !this.element.contains(card)) return;

    e.preventDefault();

    // prepare offsets
    const rect = card.getBoundingClientRect();
    this.dragOffsetX = e.clientX - rect.left;
    this.dragOffsetY = e.clientY - rect.top;

    // Save original position so we can restore/cancel if needed
    this.originalParent = card.parentElement;
    this.originalNextSibling = card.nextSibling;

    // set drag state
    this.draggedCard = card;
    this.draggedCard.classList.add("dragged");
    // set explicit width so it doesn't shrink when moved to body
    this.draggedCard.style.width = rect.width + "px";
    // set visual state for dragging; cursor becomes grabbing while dragging
    this.draggedCard.style.position = "absolute";
    this.draggedCard.style.zIndex = "1000";
    this.draggedCard.style.cursor = "grabbing";
    // pointer-events none allows elementFromPoint to find underlying columns
    this.draggedCard.style.pointerEvents = "none";
    document.body.style.cursor = "grabbing";
    // create placeholder in original location (so layout stays)
    this.placeholder = document.createElement("div");
    this.placeholder.classList.add("placeholder");
    this.placeholder.style.height = rect.height + "px";
    // place placeholder where the card was
    if (this.originalNextSibling) this.originalParent.insertBefore(this.placeholder, this.originalNextSibling);
    else this.originalParent.append(this.placeholder);

    // move dragged card to body so absolute coords are relative to viewport
    document.body.append(this.draggedCard);

    // immediately position the card under cursor (avoids jump)
    this.onDocumentMouseMove(e);

    // add global listeners
    document.addEventListener("mousemove", this.onDocumentMouseMove);
    // use window for mouseup so we catch release outside document
    window.addEventListener("mouseup", this.onDocumentMouseUp);
    window.addEventListener("pointerleave", this.onWindowPointerLeave);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  onDocumentMouseMove(e) {
    if (!this.draggedCard) return;

    // move element so cursor maintains initial relative offset
    const x = e.clientX - this.dragOffsetX;
    const y = e.clientY - this.dragOffsetY;
    this.draggedCard.style.left = x + "px";
    this.draggedCard.style.top = y + "px";

    // find the column under cursor
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const colEl = under ? under.closest(".column") : null;
    if (!colEl) {
      // if no column under cursor, don't change dropColumnEl but still return
      return;
    }
    this.dropColumnEl = colEl;

    // compute insertion point: before the card whose midpoint is below cursor
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
    if (next) next.before(this.placeholder);
    else if (linkEl) linkEl.before(this.placeholder);
    else colEl.append(this.placeholder);
  }

  onDocumentMouseUp(e) {
    if (!this.draggedCard) return;
    // finalize drop; target is dropColumnEl or original parent
    const targetColEl = this.dropColumnEl || this.originalParent || this.element;

    // remove placeholder defensively (in case it was moved/duplicated)
    if (this.placeholder && this.placeholder.parentElement) {
      // insert card into placeholder position
      targetColEl.insertBefore(this.draggedCard, this.placeholder);
      this.placeholder.remove();
    } else {
      // fallback: try to insert into target column at end
      targetColEl.append(this.draggedCard);
    }

    // reset inline styles so CSS rules apply
    this.draggedCard.classList.remove("dragged");
    this.draggedCard.style.position = "";
    this.draggedCard.style.zIndex = "";
    this.draggedCard.style.left = "";
    this.draggedCard.style.top = "";
    this.draggedCard.style.width = "";
    this.draggedCard.style.cursor = ""; // let CSS define grab on hover
    this.draggedCard.style.pointerEvents = "";

    // persist order for both columns involved
    try {
      const sourceColEl = this.originalParent || this.element;
      this.persistOrderForElement(sourceColEl);
      if (targetColEl !== sourceColEl) {
        this.persistOrderForElement(targetColEl);
      }
    } catch (err) {
      // swallow persistence errors but ensure cleanup
      // console.error(err);
    }

    // cleanup state & listeners
    this._clearDragListeners();
    this.draggedCard = undefined;
    this.placeholder = undefined;
    this.dropColumnEl = this.element;
    this.originalParent = null;
    this.originalNextSibling = null;
  }

  // Extra handlers to be robust if pointer leaves or page hides
  onWindowPointerLeave() {
    // If pointer left window, attempt to gracefully end drag
    this.cancelDrag();
  }

  onVisibilityChange() {
    // If tab hidden (user alt-tabs), cancel drag to avoid stuck placeholder
    if (document.visibilityState === "hidden") this.cancelDrag();
  }

  cancelDrag() {
    // If dragging, put card back to its original place (or remove placeholder)
    if (!this.draggedCard) {
      // remove any stray placeholder
      if (this.placeholder && this.placeholder.parentElement) {
        this.placeholder.remove();
        this.placeholder = undefined;
      }
      this._clearDragListeners();
      return;
    }

    // Remove placeholder and restore original positioning
    if (this.placeholder && this.placeholder.parentElement) {
      this.originalParent.insertBefore(this.draggedCard, this.placeholder);
      this.placeholder.remove();
      this.placeholder = undefined;
    } else if (this.originalNextSibling) {
      this.originalParent.insertBefore(this.draggedCard, this.originalNextSibling);
    } else {
      this.originalParent.append(this.draggedCard);
    }

    // reset styles
    this.draggedCard.classList.remove("dragged");
    this.draggedCard.style.position = "";
    this.draggedCard.style.zIndex = "";
    this.draggedCard.style.left = "";
    this.draggedCard.style.top = "";
    this.draggedCard.style.width = "";
    this.draggedCard.style.cursor = "";
    this.draggedCard.style.pointerEvents = "";

    // persist original column order just in case
    try {
      if (this.originalParent) this.persistOrderForElement(this.originalParent);
    } catch { }

    this._clearDragListeners();
    this.draggedCard = undefined;
    this.dropColumnEl = this.element;
    this.originalParent = null;
    this.originalNextSibling = null;
  }

  _clearDragListeners() {
    document.removeEventListener("mousemove", this.onDocumentMouseMove);
    window.removeEventListener("mouseup", this.onDocumentMouseUp);
    window.removeEventListener("pointerleave", this.onWindowPointerLeave);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    document.body.style.cursor = "";
  }

  // ---------- localStorage ----------
  storageKeyForElement(colEl) {
    const key =
      ["todo", "inprogress", "done"].find((c) =>
        colEl.classList.contains(c)
      ) || this.columnKey;
    return `cards:${key}`;
  }

  readCardsForElement(colEl) {
    const key = this.storageKeyForElement(colEl);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      const { data, expiresAt } = parsed || {};
      if (typeof expiresAt === "number" && Date.now() > expiresAt) {
        localStorage.removeItem(key);
        return [];
      }
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  writeCardsForElement(colEl, cards) {
    const key = this.storageKeyForElement(colEl);
    const expiresAt = Date.now() + this.TTL_MS;
    const payload = { data: cards, expiresAt };
    localStorage.setItem(key, JSON.stringify(payload));
    this.scheduleExpiryForElement(colEl);
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

  scheduleExpiryForElement(colEl) {
    const key = this.storageKeyForElement(colEl);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return;
      const { expiresAt } = parsed || {};
      if (typeof expiresAt !== "number") return;
      const delay = expiresAt - Date.now();
      if (delay <= 0) {
        localStorage.removeItem(key);
        return;
      }
      setTimeout(() => {
        try {
          const check = localStorage.getItem(key);
          if (!check) return;
          const parsedCheck = JSON.parse(check);
          const exp = Array.isArray(parsedCheck)
            ? undefined
            : parsedCheck?.expiresAt;
          if (typeof exp === "number" && Date.now() >= exp) {
            localStorage.removeItem(key);
          }
        } catch { }
      }, delay);
    } catch { }
  }
}
