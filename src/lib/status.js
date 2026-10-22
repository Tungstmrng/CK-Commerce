export const STATUS_LABEL = {
  pending_payment: 'Waiting for payment',
  paid: 'Payment received',
  packed: 'Being packed',
  shipped: 'Shipped',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

// Colour of the status pill (classes exist in styles.css)
export const STATUS_COLOR = {
  pending_payment: 'amber',
  paid: 'green',
  packed: 'green',
  shipped: 'green',
  completed: 'green',
  cancelled: 'red',
}

// Order of the progress steps on the Track Order page
export const STEPS = ['pending_payment', 'paid', 'packed', 'shipped', 'completed']

export const ALL_STATUSES = [...STEPS, 'cancelled']
