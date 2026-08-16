import { Controller } from '../decorators/controller';
import { Get, Post } from '../decorators/methods';
import { Body, Param, Query } from '../decorators/params';
import { Injectable } from '../decorators/injectable';
import { UserService } from '../services/user.service';
import { CreateUserDto } from '../dto/create-user.dto';

@Injectable()
@Controller('users')
export class UsersController {
  constructor(private readonly userService: UserService) {}

  @Get()
  findAll(@Query('limit') limit?: string) {
    const parsedLimit = limit !== undefined ? Number(limit) : undefined;
    return this.userService.list(parsedLimit);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }
}
