// Starting schedules per kind of care. These are placeholders families edit; they carry no medical advice.
export const TEMPLATES = {
  adult: {
    label: 'Parent or other adult at home',
    schedule: [
      { title: 'Morning medication', category: 'medication', time: '08:00', instructions: 'Use the instructions on the prescription label.' },
      { title: 'Lunch', category: 'meal', time: '12:30' },
      { title: 'Evening medication', category: 'medication', time: '20:00', instructions: 'Use the instructions on the prescription label.' },
    ],
  },
  newborn: {
    label: 'Newborn',
    schedule: [
      { title: 'Vitamin drops', category: 'medication', time: '09:00' },
      { title: 'Morning feed', category: 'meal', time: '07:00' },
      { title: 'Night feed', category: 'meal', time: '23:00' },
    ],
  },
  child: {
    label: 'Child (shared between homes or carers)',
    schedule: [
      { title: 'Morning medication', category: 'medication', time: '07:30' },
      { title: 'Homework check', category: 'task', time: '17:00' },
      { title: 'Bedtime routine', category: 'task', time: '20:00' },
    ],
  },
  recovery: {
    label: 'Recovery after surgery',
    schedule: [
      { title: 'Pain medication', category: 'medication', time: '08:00', instructions: 'As prescribed.' },
      { title: 'Wound dressing check', category: 'task', time: '10:00' },
      { title: 'Physio exercises', category: 'task', time: '15:00' },
      { title: 'Evening medication', category: 'medication', time: '20:00', instructions: 'As prescribed.' },
    ],
  },
  dementia: {
    label: 'Someone living with dementia',
    schedule: [
      { title: 'Morning medication', category: 'medication', time: '08:00' },
      { title: 'Midday walk', category: 'task', time: '12:00' },
      { title: 'Evening medication', category: 'medication', time: '19:30' },
    ],
  },
  pet: {
    label: 'Pet',
    schedule: [
      { title: 'Breakfast', category: 'meal', time: '07:30' },
      { title: 'Medication', category: 'medication', time: '08:00' },
      { title: 'Dinner', category: 'meal', time: '18:00' },
    ],
  },
};
