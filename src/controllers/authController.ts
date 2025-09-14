import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../config/database';
import { User } from '../models/User';
import { config } from '../config/config';
import { loginSchema, createUserSchema } from '../validations/authValidation';

export class AuthController {
  private userRepository = AppDataSource.getRepository(User);

  public login = async (req: Request, res: Response) => {
    try {
      const { error, value } = loginSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => detail.message)
        });
      }

      const { username, password } = value;

      const user = await this.userRepository.findOne({
        where: { username, activo: true }
      });

      if (!user || !await bcrypt.compare(password, user.password)) {
        return res.status(401).json({
          success: false,
          message: 'Credenciales inválidas'
        });
      }

      const token = jwt.sign(
        { userId: user.id, username: user.username, rol: user.rol },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn }
      );

      res.json({
        success: true,
        message: 'Login exitoso',
        data: {
          token,
          user: {
            id: user.id,
            username: user.username,
            nombre: user.nombre,
            rol: user.rol
          }
        }
      });
    } catch (error) {
      console.error('Error en login:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public createUser = async (req: Request, res: Response) => {
    try {
      const { error, value } = createUserSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => detail.message)
        });
      }

      const { username, password, nombre, rol } = value;

      // Verificar si el usuario ya existe
      const existingUser = await this.userRepository.findOne({
        where: { username }
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'El usuario ya existe'
        });
      }

      // Encriptar contraseña
      const hashedPassword = await bcrypt.hash(password, config.bcryptRounds);

      // Crear usuario
      const user = this.userRepository.create({
        username,
        password: hashedPassword,
        nombre,
        rol
      });

      await this.userRepository.save(user);

      res.status(201).json({
        success: true,
        message: 'Usuario creado exitosamente',
        data: {
          id: user.id,
          username: user.username,
          nombre: user.nombre,
          rol: user.rol
        }
      });
    } catch (error) {
      console.error('Error creando usuario:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public getProfile = async (req: any, res: Response) => {
    try {
      const user = req.user;
      res.json({
        success: true,
        data: {
          id: user.id,
          username: user.username,
          nombre: user.nombre,
          rol: user.rol,
          created_at: user.created_at
        }
      });
    } catch (error) {
      console.error('Error obteniendo perfil:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };
}