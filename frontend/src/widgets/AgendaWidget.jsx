import React from 'react';
import CalendarWidget from './calendar/CalendarWidget';

export default function AgendaWidget({ widget }) {
  return <CalendarWidget mode="month" widget={widget} />;
}
