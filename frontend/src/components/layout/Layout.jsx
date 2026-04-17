import React from 'react';
import { motion } from 'framer-motion';
import Sidebar from './Sidebar';
import Header from './Header';
import AIChatbot from '../AIChatbot';
import PendingContractorNotifier from '../PendingContractorNotifier';
import { useTheme } from '../../context/ThemeContext';
import { useSidebar } from '../../context/SidebarContext';

export const Layout = ({
  children,
  onRefresh = () => {},
  loading = false,
  startDate = new Date(),
  endDate = new Date(),
  onDateRangeChange = () => {},
}) => {
  const { isDark } = useTheme();
  const { collapsed } = useSidebar();

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#0f1117]' : 'bg-[#f0f2f5]'}`}>
      {/* Sidebar — fixed, self-manages width via collapsed state */}
      <Sidebar />

      {/* Main content area — margin follows the sidebar width */}
      <div className={`${collapsed ? 'ml-[68px]' : 'ml-64'} flex flex-col min-h-screen transition-[margin] duration-300`}>
        {/* Header - Sticky */}
        <Header
          onRefresh={onRefresh}
          loading={loading}
          startDate={startDate}
          endDate={endDate}
          onDateRangeChange={onDateRangeChange}
        />

        {/* Page content — fluid width, no hard max so charts fill the space */}
        <motion.main
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className={`flex-1 p-6 ${isDark ? 'bg-[#0f1117]' : 'bg-[#f0f2f5]'}`}
        >
          <div className="w-full">
            {children}
          </div>
        </motion.main>
      </div>

      {/* AI Chatbot - Floating */}
      <AIChatbot />

      {/* Admin notification for pending Meta-discovered contractors */}
      <PendingContractorNotifier />
    </div>
  );
};

export default Layout;
