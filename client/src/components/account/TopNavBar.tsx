import { ACCOUNT_TABS } from '@/lib/accountManagement.const';

interface TopNavBarProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function TopNavBar({ activeTab, onTabChange }: TopNavBarProps) {
  return (
    <nav className="sticky top-0 z-50 flex border-b border-gray-200 bg-white">
      {ACCOUNT_TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        const isDestructive = tab.id === 'close-account';

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`
              flex items-center gap-2 px-4 py-3 font-medium text-sm border-b-2 transition-colors
              ${
                isActive
                  ? `border-blue-600 text-blue-600`
                  : `border-transparent text-gray-600 hover:text-gray-900`
              }
              ${isDestructive && !isActive && 'text-red-600'}
              ${isDestructive && isActive && 'text-red-600 border-b-red-600'}
            `}
          >
            <Icon size={16} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
