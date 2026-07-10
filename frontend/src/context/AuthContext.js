import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const username = localStorage.getItem("username");
    const avatar = localStorage.getItem("tempAvatar");

    if (token && username) {
      setUser({ token, username, avatar });
    }
  }, []);

  const login = ({ token, username, avatar }) => {
    localStorage.setItem("token", token);
    localStorage.setItem("username", username);
    if (avatar) localStorage.setItem("tempAvatar", avatar);
    setUser({ token, username, avatar });
  };

  const logout = () => {
    localStorage.clear();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
