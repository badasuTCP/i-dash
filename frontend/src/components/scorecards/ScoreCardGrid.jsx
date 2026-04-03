import React from 'react';
import { motion } from 'framer-motion';
import ScoreCard from './ScoreCard';

const ScoreCardGrid = ({ scorecards = null, loading = false }) => {
  const defaultScoreCards = [
    {
      id: 'revenue',
      label: 'Total Revenue',
      value: 124500,
      change: 11.0,
      color: 'blue',
      sparkData: [45000, 52000, 58000, 71000, 88000, 105000, 124500],
      format: 'currency',
    },
    {
      id: 'adspend',
      label: 'Ad Spend',
      value: 34250,
      change: 8.2,
      color: 'violet',
      sparkData: [18000, 22000, 24500, 27500, 30000, 32000, 34250],
      format: 'currency',
    },
    {
      id: 'leads',
      label: 'Total Leads',
      value: 1847,
      change: 14.5,
      color: 'emerald',
      sparkData: [650, 850, 1000, 1200, 1450, 1650, 1847],
      format: 'number',
    },
    {
      id: 'deals',
      label: 'Deals Won',
      value: 89,
      change: 20.5,
      color: 'amber',
      sparkData: [25, 32, 40, 52, 65, 78, 89],
      format: 'number',
    },
    {
      id: 'roas',
      label: 'Blended ROAS',
      value: 3.64,
      change: 15.8,
      color: 'cyan',
      sparkData: [2.8, 2.95, 3.1, 3.25, 3.4, 3.52, 3.64],
      format: 'decimal',
    },
    {
      id: 'cpl',
      label: 'Cost Per Lead',
      value: 15.20,
      change: -10.6,
      color: 'rose',
      sparkData: [20.5, 19.8, 18.9, 18.0, 16.8, 16.0, 15.20],
      format: 'currency',
    },
    {
      id: 'conversion',
      label: 'Conversion Rate',
      value: 3.8,
      change: 11.8,
      color: 'lime',
      sparkData: [2.1, 2.4, 2.7, 3.0, 3.3, 3.55, 3.8],
      format: 'percent',
    },
    {
      id: 'pipeline',
      label: 'Pipeline Value',
      value: 487500,
      change: 22.4,
      color: 'indigo',
      sparkData: [220000, 280000, 340000, 390000, 430000, 460000, 487500],
      format: 'currency',
    },
  ];

  const cards = scorecards || defaultScoreCards;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.4,
        ease: 'easeOut',
      },
    },
  };

  return (
    <motion.div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {cards.map((card, index) => (
        <motion.div key={card.id || index} variants={itemVariants}>
          <ScoreCard
            label={card.label}
            value={card.value}
            change={card.change}
            color={card.color}
            sparkData={card.sparkData}
            loading={loading}
            format={card.format}
          />
        </motion.div>
      ))}
    </motion.div>
  );
};

export default ScoreCardGrid;
