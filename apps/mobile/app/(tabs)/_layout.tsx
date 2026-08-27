import { Tabs } from "expo-router";
export default function TabLayout() {
  return <Tabs screenOptions={{ headerStyle: { backgroundColor: "#07121f" }, headerTintColor: "#fff", tabBarStyle: { backgroundColor: "#07121f" }, tabBarActiveTintColor: "#6ee7ff" }}>
    <Tabs.Screen name="chat" options={{ title: "Chat" }} /><Tabs.Screen name="business" options={{ title: "Business" }} /><Tabs.Screen name="actions" options={{ title: "Actions" }} />
  </Tabs>;
}
