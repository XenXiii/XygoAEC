import type { PropsWithChildren } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
export function Screen({ title, children }: PropsWithChildren<{ title: string }>) { return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.screen}><Text accessibilityRole="header" style={styles.title}>{title}</Text>{children}</ScrollView></SafeAreaView>; }
export function Card({ title, children }: PropsWithChildren<{ title: string }>) { return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text>{children}</View>; }
export const styles = StyleSheet.create({ safe:{flex:1,backgroundColor:"#07121f"},screen:{padding:20,gap:16},title:{color:"#fff",fontSize:30,fontWeight:"700"},card:{backgroundColor:"#10243a",borderRadius:18,padding:18,gap:8},cardTitle:{color:"#6ee7ff",fontSize:18,fontWeight:"600"},body:{color:"#d7e3ef",fontSize:16,lineHeight:23},muted:{color:"#93a9bd",fontSize:14} });
