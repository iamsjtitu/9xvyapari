// Close a modal only when the mouse went DOWN and UP on the backdrop itself —
// drag-selecting text inside the form and releasing outside must not close it.
export function backdropClose(onClose) {
  return {
    onMouseDown: (e) => { e.currentTarget.dataset.downOnBackdrop = e.target === e.currentTarget ? "1" : ""; },
    onClick: (e) => {
      const ok = e.currentTarget.dataset.downOnBackdrop === "1" && e.target === e.currentTarget;
      e.currentTarget.dataset.downOnBackdrop = "";
      if (ok) onClose();
    },
  };
}

export default backdropClose;
