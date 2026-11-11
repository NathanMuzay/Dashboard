import Subscriptions from './Subscriptions';
import React from 'react';
import CalendarProvider from '../widgets/calendar/CalendarProvider';
import DashboardWorkspace from '../components/DashboardWorkspace';
import DashboardWidgets from './DashboardWidgets';
import { INITIAL_WIDGETS } from './defaultWidgets';

export default function WidgetDashboard({ userId }) {
  return (
    <Subscriptions key={userId}><CalendarProvider>
      <DashboardWorkspace userId={userId} initialWidgets={INITIAL_WIDGETS}>
        {({ key, widgets, onChange }) => (
          <DashboardWidgets
            key={key}
            userId={userId}
            widgets={widgets}
            onWidgetsChange={onChange}
          />
        )}
      </DashboardWorkspace>
    </CalendarProvider></Subscriptions>
  );
}
