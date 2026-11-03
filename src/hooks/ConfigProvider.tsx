import React, { createContext, useContext, useEffect } from "react";
import config from "../../config.json";
import { resolveTheme, useThemeStore } from "@/hooks/store/theme";
import { THEMES } from "@/components/screens-component/chat-screen/config";

type Config = typeof config;

interface ConfigContextType {
  config: Config;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme } = useThemeStore();

  useEffect(() => {
    const root = document.documentElement;

    // Apply Colors
    if (config.theme.colors) {
      const colors = { ...config.theme.colors };

      // Apply Dark Mode Overrides if active
      if (resolveTheme(theme) === THEMES.dark && 'dark' in colors && typeof colors.dark === 'object') {
        Object.assign(colors, colors.dark);
      }

      Object.entries(colors).forEach(([key, value]) => {
        if (key !== 'dark' && typeof value === 'string') {
          root.style.setProperty(`--${key}`, value);
        }
      });
      
      // Also inject dark variables separately for specific dark: classes usage (legacy support/mixed usage)
      if (config.theme.colors.dark) {
         Object.entries(config.theme.colors.dark).forEach(([darkKey, darkValue]) => {
            root.style.setProperty(`--${darkKey}-dark`, darkValue as string);
         });
      }
    }

    // Apply Font Sizes
    if (config.theme.fontSizes) {
      Object.entries(config.theme.fontSizes).forEach(([key, value]) => {
        root.style.setProperty(`--font-size-${key}`, value);
      });
    }

    // Apply Font Family & URL
    if (config.theme.fonts) {
      root.style.setProperty('--font-family', config.theme.fonts.family);
    }
  }, [theme]);

  return (
    <ConfigContext.Provider value={{ config }}>
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error("useConfig must be used within a ConfigProvider");
  }
  return context.config;
};
