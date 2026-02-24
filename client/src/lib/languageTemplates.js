/**
 * Language-specific code templates
 */
export const languageTemplates = {
  javascript: `function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet('team'));`,

  typescript: `interface User {
  name: string;
  age: number;
}

function greet(user: User): string {
  return \`Hello, \${user.name}!\`;
}`,

  python: `def greet(name):
    return f"Hello, {name}!"

print(greet("team"))`,

  cpp: `#include <iostream>
using namespace std;

int main() {
    cout << "Hello, team!" << endl;
    return 0;
}`,

  c: `#include <stdio.h>

int main() {
    printf("Hello, team!\\n");
    return 0;
}`,

  csharp: `using System;

class Program {
    static void Main() {
        Console.WriteLine("Hello, team!");
    }
}`,

  java: `public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello, team!");
    }
}`,

  go: `package main

import "fmt"

func main() {
    fmt.Println("Hello, team!")
}`,

  rust: `fn main() {
    println!("Hello, team!");
}`,

  php: `<?php
function greet($name) {
    return "Hello, {$name}!";
}

echo greet("team");
?>`,

  ruby: `def greet(name)
  "Hello, #{name}!"
end

puts greet("team")`,

  sql: `SELECT * FROM users;

CREATE TABLE users (
    id INT PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100)
);

INSERT INTO users VALUES (1, 'team', 'team@example.com');`,
};
